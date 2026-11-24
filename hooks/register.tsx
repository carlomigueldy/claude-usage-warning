import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Acks, Limit } from '../types'

// Warning steps: the band appears at the first, /usage-ack hides it until the next one.
const STEPS = [80, 90, 95]
const RED_AT = 95
// Only these windows are watched, shown in this order.
const WINDOWS: { kind: string; label: string }[] = [
  { kind: 'seven_day', label: '7d' },
  { kind: 'five_hour', label: '5h' },
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Set from the "Time zone label" option; empty means work it out.
let zoneLabel = ''

const limits = atom({ plugin: 'usage-warning', key: 'limits' } as const, [] as Limit[])
const acks = atom({ plugin: 'usage-warning', key: 'acks' } as const, {} as Acks)

function stepOf(percent: number): number {
  let step = 0
  for (const s of STEPS) if (percent >= s) step = s
  return step
}

function pick(all: readonly Limit[]): Limit[] {
  return all.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

/** Windows at or past 80% that have not been acknowledged at their current step. */
function visible(all: Limit[], acked: Acks): (Limit & { label: string })[] {
  const out: (Limit & { label: string })[] = []
  for (const w of WINDOWS) {
    const l = all.find(x => x.kind === w.kind)
    if (!l) continue
    const step = stepOf(l.percentUsed)
    if (step === 0) continue
    const a = acked[w.kind]
    if (a && a.resetsAt === (l.resetsAt ?? '') && a.step >= step) continue
    out.push({ ...l, label: w.label })
  }
  return out
}

/** The local time zone's short name: SGT, PST, CET... or UTC+8 when none is known. */
function zoneName(d: Date): string {
  if (zoneLabel) return zoneLabel
  try {
    const intl = (globalThis as { Intl?: typeof Intl }).Intl
    if (intl) {
      const short = intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(d)
        .find(p => p.type === 'timeZoneName')?.value
      if (short && !/^(GMT|UTC)/.test(short)) return short
    }
  } catch {
    // fall through to the offset
  }
  const off = -d.getTimezoneOffset()
  const h = Math.floor(Math.abs(off) / 60)
  const m = Math.abs(off) % 60
  return `UTC${off < 0 ? '-' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** A reset time on the local clock: "7:30pm SGT", or "Sat 6:00pm SGT" with the day. */
function clockLocal(ms: number, withDay: boolean): string {
  const d = new Date(ms)
  const h24 = d.getHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${h12}:${mm}${h24 < 12 ? 'am' : 'pm'} ${zoneName(d)}`
  return withDay ? `${DAYS[d.getDay()]} ${time}` : time
}

function countdown(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

function describe(l: Limit & { label: string }, now: number): string {
  const pct = `${Math.round(l.percentUsed)}%`
  if (!l.resetsAt) return `${l.label} ${pct}`
  const at = Date.parse(l.resetsAt)
  if (Number.isNaN(at)) return `${l.label} ${pct}`
  return `${l.label} ${pct} · resets ${clockLocal(at, l.kind === 'seven_day')} (${countdown(at - now)})`
}

export const register: Register = (on, options) => {
  zoneLabel = String((options as { zoneLabel?: unknown }).zoneLabel ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-ack',
      description: 'Hide the usage warning band until the next step (90%, 95%) or the reset',
    })
    const saved = (await $.store.get('acks')) as Acks | undefined
    if (saved) await update($, acks, () => saved)
    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) await update($, limits, () => pick(usage.rateLimits))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await update($, limits, () => pick(e.rateLimits))
    return next(e)
  })

  on('command.run', { command: 'usage-ack' }, async $ => {
    const shown = visible(await read($, limits), await read($, acks))
    if (shown.length === 0) return { text: 'No usage warning to hide.' }
    const nextAcks: Acks = { ...(await read($, acks)) }
    for (const l of shown) nextAcks[l.kind] = { step: stepOf(l.percentUsed), resetsAt: l.resetsAt ?? '' }
    await update($, acks, () => nextAcks)
    await $.store.set('acks', nextAcks)
    const names = shown.map(l => `${l.label} ${Math.round(l.percentUsed)}%`).join(', ')
    return { text: `Hidden: ${names}. It comes back at the next step (90%, 95%) or after the reset.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const shown = visible(await read($, limits), await read($, acks))
    if (shown.length === 0) return next(e)

    const now = await $.clock.now()
    const isRed = shown.some(l => l.percentUsed >= RED_AT)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={isRed ? 'error' : 'warning'} bold>
          ⚠ {shown.map(l => describe(l, now)).join('  |  ')}
        </Text>
        <Text dimColor>{'  '}/usage-ack to hide</Text>
      </Box>
    )
  })
}

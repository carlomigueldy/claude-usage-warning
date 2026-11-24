import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-warning',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

const ACK = {
  command: 'usage-ack',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 120 },
} as const

// Sat 2026-11-28 18:00 SGT = 10:00 UTC
const WEEK_RESET = '2026-11-28T10:00:00.000Z'
// Tue 2026-11-24 19:30 SGT
const FIVE_RESET = '2026-11-24T11:30:00.000Z'

function measure(week: number, five: number) {
  return {
    context: { windowTokens: 1000000 } as never,
    rateLimits: [
      { kind: 'five_hour', percentUsed: five, resetsAt: FIVE_RESET },
      { kind: 'seven_day', percentUsed: week, resetsAt: WEEK_RESET },
    ],
    changed: ['rateLimits' as const],
  }
}

for (const surface of ['terminal', 'desktop'] as const) test(`band at 80%, combined, /usage-ack until next step (${surface})`, async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.run', () => ({ text: '' }))
  on('store.set', () => ({ value: undefined }))
  // Tue 2026-11-24 16:40 SGT
  on('clock.now', () => ({ value: Date.parse('2026-11-24T08:40:00.000Z') }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  {
    // Below 80%: nothing of ours.
    await $.session.measure(measure(50, 30))
    let ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()

    // Both over 80%: one combined row, weekly first, local times.
    await $.session.measure(measure(82, 91))
    ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Text', text: /7d 82%/ })
    expect(row?.text).toMatch(/7d 82% · resets \w{3} \d{1,2}:\d{2}[ap]m \S+ \(4d 1h\)/)
    expect(row?.text).toMatch(/5h 91% · resets \d{1,2}:\d{2}[ap]m \S+ \(2h50m\)/)
    await ui.unmount()

    // Ack hides it.
    await $.command.run(ACK)
    ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /7d/ })).toBeUndefined()
    await ui.unmount()

    // Weekly reaches the next step (90%): back, weekly only.
    await $.session.measure(measure(90, 92))
    ui = await $.ui.mount({ ...BAND, surface })
    const back = await ui.find({ type: 'Text', text: /7d 90%/ })
    expect(back?.text).not.toContain('5h')
    await ui.unmount()

  }
})

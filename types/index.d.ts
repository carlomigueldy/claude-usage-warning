export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** Per window kind: the step acknowledged, and for which reset it holds. */
export type Ack = { step: number; resetsAt: string }
export type Acks = Record<string, Ack>

declare module 'claude-code' {
  interface PluginState {
    'usage-warning': { limits: Limit[]; acks: Acks }
  }
}

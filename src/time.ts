import type { Cue } from './types'

export function formatSrtTime(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(msTotal / 3_600_000)
  const m = Math.floor((msTotal % 3_600_000) / 60_000)
  const s = Math.floor((msTotal % 60_000) / 1000)
  const ms = msTotal % 1000
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`
}

export function formatClock(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(msTotal / 3_600_000)
  const m = Math.floor((msTotal % 3_600_000) / 60_000)
  const s = Math.floor((msTotal % 60_000) / 1000)
  const ms = msTotal % 1000
  if (h > 0) return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`
  return `${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`
}

/** Filename-safe timestamp matching video position, e.g. 00-01-05-200 */
export function formatFileTimestamp(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(msTotal / 3_600_000)
  const m = Math.floor((msTotal % 3_600_000) / 60_000)
  const s = Math.floor((msTotal % 60_000) / 1000)
  const ms = msTotal % 1000
  return `${pad(h, 2)}-${pad(m, 2)}-${pad(s, 2)}-${pad(ms, 3)}`
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0')
}

export function parseTimeInput(value: string): number | null {
  const v = value.trim().replace(',', '.')
  if (!v) return null
  const parts = v.split(':')
  if (parts.length === 1) {
    const n = Number(parts[0])
    return Number.isFinite(n) ? n : null
  }
  if (parts.length === 2) {
    const m = Number(parts[0])
    const s = Number(parts[1])
    if (![m, s].every(Number.isFinite)) return null
    return m * 60 + s
  }
  if (parts.length === 3) {
    const h = Number(parts[0])
    const m = Number(parts[1])
    const s = Number(parts[2])
    if (![h, m, s].every(Number.isFinite)) return null
    return h * 3600 + m * 60 + s
  }
  return null
}

export function cuesToSrt(cues: Cue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  return sorted
    .map((c, i) => {
      const text = c.text.trim() || '…'
      return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${text}\n`
    })
    .join('\n')
}

export function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

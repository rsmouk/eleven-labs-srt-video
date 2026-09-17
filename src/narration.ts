import type Player from 'video.js/dist/types/player'
import type { Cue } from './types'
import { cueCoverageEnd } from './time'

let player: Player | null = null
let getCues: () => Cue[] = () => []
let narration: HTMLAudioElement | null = null
let activeCueId: string | null = null
let bound = false

export function bindNarrationSync(p: Player, cuesGetter: () => Cue[]): void {
  unbindNarrationSync()
  player = p
  getCues = cuesGetter
  bound = true

  p.on('timeupdate', onTimeUpdate)
  p.on('play', onPlay)
  p.on('pause', onPause)
  p.on('seeking', onSeeking)
  p.on('ended', stopNarration)
}

export function unbindNarrationSync(): void {
  if (player && bound) {
    player.off('timeupdate', onTimeUpdate)
    player.off('play', onPlay)
    player.off('pause', onPause)
    player.off('seeking', onSeeking)
    player.off('ended', stopNarration)
  }
  stopNarration()
  player = null
  bound = false
}

function cuesWithAudio(): Cue[] {
  return getCues()
    .filter((c) => Boolean(c.audioUrl))
    .sort((a, b) => a.start - b.start)
}

/** Prefer the earliest-starting cue that covers this time (no mid-sentence cutoffs). */
function findCueAtTime(time: number): Cue | undefined {
  const matches = cuesWithAudio().filter((c) => time >= c.start && time < cueCoverageEnd(c))
  return matches[0]
}

function onTimeUpdate(): void {
  if (!player || player.paused()) return
  syncToTime(player.currentTime() ?? 0)
}

function onPlay(): void {
  if (!player) return
  const time = player.currentTime() ?? 0
  if (activeCueId && narration && !narration.ended) {
    void narration.play().catch(() => undefined)
    return
  }
  syncToTime(time)
}

function onPause(): void {
  narration?.pause()
}

function onSeeking(): void {
  if (!player) return
  const time = player.currentTime() ?? 0
  // Seeking always re-evaluates — stop current and sync to new position
  stopNarration()
  if (!player.paused()) syncToTime(time)
}

function syncToTime(time: number): void {
  // Let the current narration finish so later overlapping cues don't cut it off
  if (activeCueId && narration && !narration.paused && !narration.ended) {
    const active = cuesWithAudio().find((c) => c.id === activeCueId)
    if (active && time >= active.start - 0.05) return
  }

  const cue = findCueAtTime(time)

  if (!cue?.audioUrl) {
    if (!(activeCueId && narration && !narration.paused && !narration.ended)) {
      stopNarration()
    }
    return
  }

  if (activeCueId === cue.id && narration) {
    if (narration.paused && player && !player.paused()) {
      void narration.play().catch(() => undefined)
    }
    return
  }

  playCue(cue, Math.max(0, time - cue.start))
}

function playCue(cue: Cue, offsetSeconds: number): void {
  if (!cue.audioUrl) return
  stopNarration()

  narration = new Audio(cue.audioUrl)
  narration.preload = 'auto'
  activeCueId = cue.id

  const startAt = () => {
    if (!narration) return
    const duration = Number.isFinite(narration.duration)
      ? narration.duration
      : cue.audioDuration ?? Number.POSITIVE_INFINITY
    if (offsetSeconds > 0.05 && Number.isFinite(duration)) {
      narration.currentTime = Math.min(offsetSeconds, Math.max(0, duration - 0.05))
    }
    if (player && !player.paused()) {
      void narration.play().catch(() => undefined)
    }
  }

  narration.addEventListener('loadedmetadata', startAt, { once: true })
  narration.addEventListener(
    'ended',
    () => {
      if (activeCueId === cue.id) {
        activeCueId = null
        narration = null
        // Pick up the next cue if video time is already inside its window
        if (player && !player.paused()) {
          syncToTime(player.currentTime() ?? 0)
        }
      }
    },
    { once: true },
  )

  if (narration.readyState >= 1) startAt()
}

export function stopNarration(): void {
  if (narration) {
    narration.pause()
    narration.src = ''
    narration = null
  }
  activeCueId = null
}

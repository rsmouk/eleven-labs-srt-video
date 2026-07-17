import type Player from 'video.js/dist/types/player'
import type { Cue } from './types'

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

function findActiveCue(time: number): Cue | undefined {
  // Prefer cue whose window contains current time
  const inWindow = cuesWithAudio().find((c) => time >= c.start && time < Math.max(c.end, c.start + 0.05))
  if (inWindow) return inWindow

  // If audio outlasts end, keep it active while still playing
  if (activeCueId && narration && !narration.paused && !narration.ended) {
    return cuesWithAudio().find((c) => c.id === activeCueId)
  }
  return undefined
}

function onTimeUpdate(): void {
  if (!player || player.paused()) return
  syncToTime(player.currentTime() ?? 0)
}

function onPlay(): void {
  if (!player) return
  const time = player.currentTime() ?? 0
  const cue = findActiveCue(time)
  if (!cue?.audioUrl) return

  if (activeCueId === cue.id && narration) {
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
  const cue = findActiveCue(time)

  if (!cue?.audioUrl) {
    stopNarration()
    return
  }

  if (activeCueId === cue.id && narration) {
    const offset = Math.max(0, time - cue.start)
    if (Number.isFinite(narration.duration) && offset < narration.duration) {
      narration.currentTime = offset
    }
    if (!player.paused()) void narration.play().catch(() => undefined)
    else narration.pause()
    return
  }

  if (!player.paused()) syncToTime(time)
  else stopNarration()
}

function syncToTime(time: number): void {
  const cue = cuesWithAudio().find((c) => time >= c.start && time < Math.max(c.end, c.start + 0.05))

  if (!cue?.audioUrl) {
    // Allow current narration to finish if we already started it at cue.start
    if (activeCueId && narration && !narration.paused && !narration.ended) return
    stopNarration()
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
    if (offsetSeconds > 0.05 && Number.isFinite(narration.duration)) {
      narration.currentTime = Math.min(offsetSeconds, Math.max(0, narration.duration - 0.05))
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
      }
    },
    { once: true },
  )

  // If metadata already cached
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

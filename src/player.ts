import type { Cue } from './types'

type VideoJsApi = typeof import('video.js').default
type Player = import('video.js/dist/types/player').default

let videojs: VideoJsApi | null = null
let player: Player | null = null

async function ensureVideoJs(): Promise<VideoJsApi> {
  if (videojs) return videojs
  const mod = await import('video.js')
  videojs = mod.default
  return videojs
}

export function getPlayer(): Player | null {
  return player
}

export function disposePlayer(): void {
  if (player) {
    player.dispose()
    player = null
  }
}

export async function initPlayer(videoEl: HTMLVideoElement, src: string): Promise<Player> {
  disposePlayer()
  const vjs = await ensureVideoJs()

  player = vjs(videoEl, {
    controls: true,
    fluid: false,
    responsive: true,
    preload: 'auto',
    inactivityTimeout: 0,
    playbackRates: [0.75, 1, 1.25, 1.5],
    controlBar: {
      pictureInPictureToggle: false,
    },
    sources: [{ src, type: guessMime(src) }],
  })

  const applyFit = () => fitPlayerLayout(player!)
  player.ready(() => {
    applyFit()
    player!.on('loadedmetadata', applyFit)
    player!.on('loadeddata', applyFit)
  })

  window.addEventListener('resize', applyFit)

  const prevDispose = player.dispose.bind(player)
  player.dispose = () => {
    window.removeEventListener('resize', applyFit)
    prevDispose()
  }

  return player
}

/** Size the player for landscape vs story/portrait videos. */
export function fitPlayerLayout(p: Player = player!): void {
  if (!p) return
  const el = p.el() as HTMLElement | null
  const host = document.getElementById('player-host')
  if (!el || !host) return

  const tech = p.tech(true) as unknown as { el?: () => HTMLVideoElement } | undefined
  const media = tech?.el?.() ?? (el.querySelector('video') as HTMLVideoElement | null)
  const w = media?.videoWidth || 0
  const h = media?.videoHeight || 0
  if (!w || !h) return

  const portrait = h > w
  host.classList.toggle('is-portrait', portrait)
  host.classList.toggle('is-landscape', !portrait)

  const ratio = `${w}:${h}`
  p.aspectRatio(ratio)

  // Cap height so stories stay moderate on large screens
  const maxH = portrait
    ? Math.min(window.innerHeight * 0.68, 560)
    : Math.min(window.innerHeight * 0.52, 480)
  const maxW = portrait ? Math.min(host.clientWidth || 360, 360) : host.clientWidth || 900
  const heightFromWidth = (maxW * h) / w
  const widthFromHeight = (maxH * w) / h

  if (heightFromWidth <= maxH) {
    p.dimensions(Math.round(maxW), Math.round(heightFromWidth))
  } else {
    p.dimensions(Math.round(widthFromHeight), Math.round(maxH))
  }
}

function guessMime(src: string): string {
  if (src.startsWith('blob:')) return 'video/mp4'
  if (src.includes('.webm')) return 'video/webm'
  if (src.includes('.ogg')) return 'video/ogg'
  return 'video/mp4'
}

export function getCurrentTime(): number {
  return player?.currentTime() ?? 0
}

export function getDuration(): number {
  const d = player?.duration()
  return typeof d === 'number' && Number.isFinite(d) ? d : 0
}

export function seekAndPlay(time: number): void {
  if (!player) return
  player.currentTime(time)
  void player.play()
}

export function pausePlayer(): void {
  player?.pause()
}

/** Draw cue markers on the Video.js progress control. */
export function updateMarkers(cues: Cue[]): void {
  if (!player) return

  const progress = player.el()?.querySelector('.vjs-progress-holder') as HTMLElement | null
  if (!progress) return

  progress.querySelectorAll('.vjs-marker').forEach((el) => el.remove())

  const duration = getDuration()
  if (!duration || duration <= 0) return

  for (const cue of cues) {
    const pct = Math.min(100, Math.max(0, (cue.start / duration) * 100))
    const marker = document.createElement('div')
    marker.className = 'vjs-marker'
    marker.style.left = `${pct}%`
    marker.title = cue.text.trim() || formatTip(cue.start)
    marker.dataset.cueId = cue.id

    const tip = document.createElement('span')
    tip.className = 'vjs-marker-tip'
    tip.textContent = cue.text.trim() || formatTip(cue.start)
    marker.appendChild(tip)

    marker.addEventListener('click', (e) => {
      e.stopPropagation()
      seekAndPlay(cue.start)
    })

    progress.appendChild(marker)
  }
}

function formatTip(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

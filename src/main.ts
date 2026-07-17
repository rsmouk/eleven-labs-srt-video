import './style.css'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { synthesizeSpeech } from './elevenlabs'
import { t } from './i18n'
import { loadLang, loadSettings, saveLang, saveSettings } from './storage'
import { cuesToSrt, formatClock, formatFileTimestamp, parseTimeInput, uid } from './time'
import type { Cue, ElevenSettings, Lang } from './types'

const root = document.querySelector<HTMLDivElement>('#app')!
if (!root) throw new Error('#app missing')

let lang: Lang = loadLang()
let settings: ElevenSettings = loadSettings()
let videoUrl: string | null = null
let videoName = ''
let cues: Cue[] = []
let toastTimer = 0
let deferredPrompt: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  render()
})

function applyDir() {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

function showToast(message: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.classList.remove('opacity-0', 'pointer-events-none')
  el.classList.add('opacity-100')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    el.classList.add('opacity-0', 'pointer-events-none')
    el.classList.remove('opacity-100')
  }, 2800)
}

function revokeCueAudio(cue: Cue) {
  if (cue.audioUrl) URL.revokeObjectURL(cue.audioUrl)
}

function setVideoFile(file: File) {
  if (videoUrl) URL.revokeObjectURL(videoUrl)
  cues.forEach(revokeCueAudio)
  cues = []
  videoUrl = URL.createObjectURL(file)
  videoName = file.name.replace(/\.[^.]+$/, '') || 'video'
  render()
}

function getVideo(): HTMLVideoElement | null {
  return document.getElementById('player') as HTMLVideoElement | null
}

function addCueAtCurrent() {
  const video = getVideo()
  if (!video || !videoUrl) return
  const start = video.currentTime
  const end = Math.min(start + 3, Number.isFinite(video.duration) ? video.duration : start + 3)
  cues = [
    ...cues,
    {
      id: uid(),
      start,
      end: end > start ? end : start + 0.5,
      text: '',
    },
  ].sort((a, b) => a.start - b.start)
  render()
  window.requestAnimationFrame(() => {
    const last = document.querySelector<HTMLTextAreaElement>(`textarea[data-cue="${cues[cues.length - 1]?.id}"]`)
    last?.focus()
  })
}

function updateCue(id: string, patch: Partial<Cue>) {
  cues = cues.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

function removeCue(id: string) {
  const cue = cues.find((c) => c.id === id)
  if (cue) revokeCueAudio(cue)
  cues = cues.filter((c) => c.id !== id)
  render()
}

async function generateOne(id: string) {
  if (!settings.apiKey || !settings.voiceId) {
    showToast(t(lang, 'needSettings'))
    openSettings()
    return
  }
  const cue = cues.find((c) => c.id === id)
  if (!cue || !cue.text.trim()) return

  updateCue(id, { generating: true })
  renderCuesOnly()

  try {
    const blob = await synthesizeSpeech(cue.text, settings)
    revokeCueAudio(cue)
    const audioUrl = URL.createObjectURL(blob)
    updateCue(id, { generating: false, audioBlob: blob, audioUrl })
    showToast(t(lang, 'doneAudio'))
  } catch (err) {
    updateCue(id, { generating: false })
    showToast(`${t(lang, 'errorAudio')}: ${err instanceof Error ? err.message : String(err)}`)
  }
  renderCuesOnly()
}

async function generateAll() {
  if (!settings.apiKey || !settings.voiceId) {
    showToast(t(lang, 'needSettings'))
    openSettings()
    return
  }
  if (!cues.length) {
    showToast(t(lang, 'needCues'))
    return
  }
  for (const cue of [...cues]) {
    if (!cue.text.trim()) continue
    await generateOne(cue.id)
  }
}

function downloadSrt() {
  if (!cues.length) {
    showToast(t(lang, 'needCues'))
    return
  }
  const content = cuesToSrt(cues)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, `${videoName || 'captions'}.srt`)
}

async function downloadAudioZip() {
  const withAudio = cues.filter((c) => c.audioBlob)
  if (!withAudio.length) {
    showToast(t(lang, 'needAudio'))
    return
  }
  const zip = new JSZip()
  const sorted = [...withAudio].sort((a, b) => a.start - b.start)
  sorted.forEach((c, i) => {
    const name = `${String(i + 1).padStart(3, '0')}_${formatFileTimestamp(c.start)}.mp3`
    zip.file(name, c.audioBlob!)
  })
  const timing = sorted
    .map(
      (c, i) =>
        `${String(i + 1).padStart(3, '0')}\t${formatClock(c.start)}\t${formatClock(c.end)}\t${c.text.replace(/\s+/g, ' ').trim()}`,
    )
    .join('\n')
  zip.file('timing.txt', `index\tstart\tend\ttext\n${timing}\n`)
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${videoName || 'narration'}_audio.zip`)
}

function openSettings() {
  const modal = document.getElementById('settings-modal')
  modal?.classList.remove('hidden')
  modal?.setAttribute('aria-hidden', 'false')
}

function closeSettings() {
  const modal = document.getElementById('settings-modal')
  modal?.classList.add('hidden')
  modal?.setAttribute('aria-hidden', 'true')
}

function persistSettingsFromForm() {
  const apiKey = (document.getElementById('set-api') as HTMLInputElement).value
  const voiceId = (document.getElementById('set-voice') as HTMLInputElement).value
  const modelId = (document.getElementById('set-model') as HTMLInputElement).value
  settings = { apiKey, voiceId, modelId }
  saveSettings(settings)
  showToast(t(lang, 'saved'))
  closeSettings()
}

async function installPwa() {
  if (!deferredPrompt) return
  await deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  render()
}

function renderCuesOnly() {
  const list = document.getElementById('cues-list')
  if (!list) return
  list.innerHTML = cuesHtml()
  bindCueEvents(list)
}

function cuesHtml(): string {
  if (!cues.length) {
    return `<p class="rounded-2xl border border-dashed border-sand bg-white/40 px-4 py-8 text-center text-sm text-ink/55">${t(lang, 'emptyCues')}</p>`
  }

  return cues
    .map(
      (c) => `
      <article class="animate-rise rounded-2xl border border-sand/80 bg-white/70 p-4 shadow-[0_8px_30px_-18px_rgba(28,43,38,0.35)] backdrop-blur-sm" data-id="${c.id}">
        <div class="mb-3 flex flex-wrap items-end gap-3">
          <label class="flex min-w-[7rem] flex-1 flex-col gap-1 text-xs font-medium text-ink/60">
            ${t(lang, 'start')}
            <input data-field="start" value="${formatClock(c.start)}" class="rounded-xl border border-sand bg-mist/80 px-3 py-2 text-sm text-ink" />
          </label>
          <label class="flex min-w-[7rem] flex-1 flex-col gap-1 text-xs font-medium text-ink/60">
            ${t(lang, 'end')}
            <input data-field="end" value="${formatClock(c.end)}" class="rounded-xl border border-sand bg-mist/80 px-3 py-2 text-sm text-ink" />
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="seek" class="rounded-xl border border-sand bg-white px-3 py-2 text-xs font-semibold text-leaf-deep hover:bg-fog">${formatClock(c.start)}</button>
            <button type="button" data-action="generate" class="rounded-xl bg-leaf px-3 py-2 text-xs font-semibold text-white hover:bg-leaf-deep disabled:opacity-50" ${c.generating ? 'disabled' : ''}>
              ${c.generating ? t(lang, 'generating') : t(lang, 'generate')}
            </button>
            ${
              c.audioUrl
                ? `<button type="button" data-action="play-audio" class="rounded-xl border border-leaf/30 bg-fog px-3 py-2 text-xs font-semibold text-leaf-deep">${t(lang, 'playAudio')}</button>`
                : ''
            }
            <button type="button" data-action="delete" class="rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-warn hover:bg-warn/10">${t(lang, 'delete')}</button>
          </div>
        </div>
        <label class="flex flex-col gap-1 text-xs font-medium text-ink/60">
          ${t(lang, 'text')}
          <textarea data-cue="${c.id}" data-field="text" rows="2" placeholder="${t(lang, 'cuePlaceholder')}" class="w-full resize-y rounded-xl border border-sand bg-mist/60 px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink/35">${escapeHtml(c.text)}</textarea>
        </label>
        ${c.audioUrl ? `<audio class="mt-3 w-full" controls src="${c.audioUrl}"></audio>` : ''}
      </article>
    `,
    )
    .join('')
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function bindCueEvents(list: HTMLElement) {
  list.querySelectorAll<HTMLElement>('[data-id]').forEach((card) => {
    const id = card.dataset.id!
    card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]').forEach((input) => {
      const commit = () => {
        const field = input.dataset.field
        if (field === 'text') {
          updateCue(id, { text: input.value })
          return
        }
        const parsed = parseTimeInput(input.value)
        if (parsed == null) return
        if (field === 'start') updateCue(id, { start: parsed })
        if (field === 'end') updateCue(id, { end: parsed })
      }
      input.addEventListener('change', commit)
      input.addEventListener('blur', () => {
        commit()
        const cue = cues.find((c) => c.id === id)
        if (!cue) return
        if (input.dataset.field === 'start') input.value = formatClock(cue.start)
        if (input.dataset.field === 'end') input.value = formatClock(cue.end)
      })
    })

    card.querySelector('[data-action="generate"]')?.addEventListener('click', () => void generateOne(id))
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => removeCue(id))
    card.querySelector('[data-action="seek"]')?.addEventListener('click', () => {
      const video = getVideo()
      const cue = cues.find((c) => c.id === id)
      if (video && cue) {
        video.currentTime = cue.start
        void video.play()
      }
    })
    card.querySelector('[data-action="play-audio"]')?.addEventListener('click', () => {
      const audio = card.querySelector('audio')
      void audio?.play()
    })
  })
}

function render() {
  applyDir()
  const hasVideo = Boolean(videoUrl)

  root.innerHTML = `
    <div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-16 pt-4 sm:px-6">
      <header class="animate-rise mb-8 flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/55 px-4 py-3 shadow-[0_10px_40px_-24px_rgba(28,43,38,0.45)] backdrop-blur-md">
        <div class="min-w-0">
          <p class="font-display text-xl font-semibold tracking-tight text-leaf-deep sm:text-2xl">${t(lang, 'brand')}</p>
          <p class="truncate text-xs text-ink/50 sm:text-sm">${t(lang, 'tagline')}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          ${
            deferredPrompt
              ? `<button type="button" id="btn-install" class="hidden rounded-xl border border-sand bg-fog px-3 py-2 text-xs font-semibold text-leaf-deep sm:inline-flex">${t(lang, 'installPwa')}</button>`
              : ''
          }
          <button type="button" id="btn-lang" class="rounded-xl border border-sand bg-white px-3 py-2 text-xs font-semibold text-ink/80 hover:bg-mist">${t(lang, 'lang')}</button>
          <button type="button" id="btn-settings" class="rounded-xl bg-leaf px-3 py-2 text-xs font-semibold text-white hover:bg-leaf-deep">${t(lang, 'settings')}</button>
        </div>
      </header>

      ${
        !hasVideo
          ? `
        <section id="dropzone" class="animate-rise flex flex-1 flex-col items-center justify-center rounded-[2rem] border border-dashed border-leaf/25 bg-white/45 px-6 py-16 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div class="mb-4 h-14 w-14 rounded-full bg-fog animate-pulse-soft"></div>
          <h1 class="font-display text-3xl font-medium text-ink sm:text-4xl">${t(lang, 'uploadTitle')}</h1>
          <p class="mt-3 max-w-md text-sm leading-relaxed text-ink/55">${t(lang, 'uploadHint')}</p>
          <label class="mt-8 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-leaf px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-leaf/20 hover:bg-leaf-deep">
            ${t(lang, 'chooseVideo')}
            <input id="file-input" type="file" accept="video/*" class="hidden" />
          </label>
        </section>
      `
          : `
        <section class="animate-rise space-y-6">
          <div class="video-shell overflow-hidden rounded-[1.75rem] border border-sand/80 bg-ink shadow-[0_20px_50px_-28px_rgba(28,43,38,0.55)]">
            <video id="player" src="${videoUrl}" controls playsinline class="block"></video>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex cursor-pointer items-center rounded-xl border border-sand bg-white px-3 py-2 text-xs font-semibold text-ink/70 hover:bg-mist">
              ${t(lang, 'changeVideo')}
              <input id="file-input" type="file" accept="video/*" class="hidden" />
            </label>
            <button type="button" id="btn-add-cue" class="rounded-xl bg-leaf px-4 py-2 text-xs font-semibold text-white hover:bg-leaf-deep">${t(lang, 'addCue')}</button>
            <button type="button" id="btn-gen-all" class="rounded-xl border border-leaf/30 bg-fog px-4 py-2 text-xs font-semibold text-leaf-deep hover:bg-sand/60">${t(lang, 'generateAll')}</button>
            <button type="button" id="btn-dl-srt" class="rounded-xl border border-sand bg-white px-4 py-2 text-xs font-semibold text-ink/80 hover:bg-mist">${t(lang, 'downloadSrt')}</button>
            <button type="button" id="btn-dl-audio" class="rounded-xl border border-sand bg-white px-4 py-2 text-xs font-semibold text-ink/80 hover:bg-mist">${t(lang, 'downloadAudio')}</button>
          </div>
          <p class="text-xs text-ink/45">${t(lang, 'timeHint')}</p>

          <div>
            <h2 class="mb-3 font-display text-xl font-medium text-ink">${t(lang, 'cues')}</h2>
            <div id="cues-list" class="space-y-3">${cuesHtml()}</div>
          </div>
        </section>
      `
      }

      <div id="settings-modal" class="fixed inset-0 z-50 hidden" aria-hidden="true">
        <div id="settings-backdrop" class="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"></div>
        <div class="relative mx-auto mt-[10vh] max-w-md rounded-3xl border border-white/80 bg-mist p-6 shadow-2xl">
          <h2 class="font-display text-2xl font-medium text-ink">${t(lang, 'settingsTitle')}</h2>
          <p class="mt-1 text-sm text-ink/50">${t(lang, 'settingsHint')}</p>
          <form id="settings-form" class="mt-5 space-y-4">
            <label class="block text-xs font-semibold text-ink/60">
              ${t(lang, 'apiKey')}
              <input id="set-api" type="password" autocomplete="off" value="${escapeHtml(settings.apiKey)}" class="mt-1 w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-sm" />
            </label>
            <label class="block text-xs font-semibold text-ink/60">
              ${t(lang, 'voiceId')}
              <input id="set-voice" type="text" value="${escapeHtml(settings.voiceId)}" class="mt-1 w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-sm" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" />
            </label>
            <label class="block text-xs font-semibold text-ink/60">
              ${t(lang, 'modelId')}
              <select id="set-model" class="mt-1 w-full rounded-xl border border-sand bg-white px-3 py-2.5 text-sm">
                <option value="eleven_multilingual_v2" ${settings.modelId === 'eleven_multilingual_v2' ? 'selected' : ''}>eleven_multilingual_v2</option>
                <option value="eleven_turbo_v2_5" ${settings.modelId === 'eleven_turbo_v2_5' ? 'selected' : ''}>eleven_turbo_v2_5</option>
                <option value="eleven_flash_v2_5" ${settings.modelId === 'eleven_flash_v2_5' ? 'selected' : ''}>eleven_flash_v2_5</option>
                <option value="eleven_monolingual_v1" ${settings.modelId === 'eleven_monolingual_v1' ? 'selected' : ''}>eleven_monolingual_v1</option>
              </select>
            </label>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="btn-close-settings" class="rounded-xl border border-sand bg-white px-4 py-2 text-sm font-semibold text-ink/70">${t(lang, 'close')}</button>
              <button type="submit" class="rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-deep">${t(lang, 'save')}</button>
            </div>
          </form>
        </div>
      </div>

      <div id="toast" class="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white opacity-0 shadow-lg transition-opacity duration-300"></div>
    </div>
  `

  bindGlobalEvents()
  const list = document.getElementById('cues-list')
  if (list) bindCueEvents(list)
}

function bindGlobalEvents() {
  document.getElementById('btn-lang')?.addEventListener('click', () => {
    lang = lang === 'en' ? 'ar' : 'en'
    saveLang(lang)
    render()
  })
  document.getElementById('btn-settings')?.addEventListener('click', openSettings)
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings)
  document.getElementById('settings-backdrop')?.addEventListener('click', closeSettings)
  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    persistSettingsFromForm()
  })
  document.getElementById('btn-install')?.addEventListener('click', () => void installPwa())

  const fileInput = document.getElementById('file-input') as HTMLInputElement | null
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) setVideoFile(file)
  })

  const dropzone = document.getElementById('dropzone')
  if (dropzone) {
    ;['dragenter', 'dragover'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault()
        dropzone.classList.add('ring-2', 'ring-leaf/40')
      })
    })
    ;['dragleave', 'drop'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault()
        dropzone.classList.remove('ring-2', 'ring-leaf/40')
      })
    })
    dropzone.addEventListener('drop', (e) => {
      const dt = (e as DragEvent).dataTransfer
      const file = dt?.files?.[0]
      if (file?.type.startsWith('video/')) setVideoFile(file)
    })
  }

  document.getElementById('btn-add-cue')?.addEventListener('click', addCueAtCurrent)
  document.getElementById('btn-gen-all')?.addEventListener('click', () => void generateAll())
  document.getElementById('btn-dl-srt')?.addEventListener('click', downloadSrt)
  document.getElementById('btn-dl-audio')?.addEventListener('click', () => void downloadAudioZip())
}

render()

if ('serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })
}

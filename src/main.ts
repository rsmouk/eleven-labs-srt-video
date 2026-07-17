import './style.css'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { synthesizeSpeech } from './elevenlabs'
import { t } from './i18n'
import {
  disposePlayer,
  getCurrentTime,
  getDuration,
  getPlayer,
  initPlayer,
  pausePlayer,
  seekAndPlay,
  updateMarkers,
} from './player'
import { bindNarrationSync, stopNarration, unbindNarrationSync } from './narration'
import { isSpeechSupported, startDictation } from './speech'
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
let stopDictation: (() => void) | null = null
let listeningCueId: string | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  updateChromeTexts()
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

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function setVideoFile(file: File) {
  if (videoUrl) URL.revokeObjectURL(videoUrl)
  cues.forEach(revokeCueAudio)
  cues = []
  stopNarration()
  unbindNarrationSync()
  disposePlayer()
  videoUrl = URL.createObjectURL(file)
  videoName = file.name.replace(/\.[^.]+$/, '') || 'video'
  showWorkspace()
  void mountPlayer()
  refreshCues()
}

async function mountPlayer() {
  if (!videoUrl) return
  const host = document.getElementById('player-host')
  if (!host) return

  host.classList.remove('is-portrait', 'is-landscape')
  host.innerHTML = `
    <video
      id="player"
      class="video-js vjs-big-play-centered"
      playsinline
    ></video>
  `
  const videoEl = document.getElementById('player') as HTMLVideoElement
  const player = await initPlayer(videoEl, videoUrl)
  player.ready(() => {
    updateMarkers(cues)
    player.on('loadedmetadata', () => updateMarkers(cues))
    bindNarrationSync(player, () => cues)
  })
}

function addCueAtCurrent() {
  if (!videoUrl || !getPlayer()) return
  const start = getCurrentTime()
  pausePlayer()
  const duration = getDuration()
  const end = Math.min(start + 3, duration > 0 ? duration : start + 3)
  const id = uid()
  cues = [
    ...cues,
    {
      id,
      start,
      end: end > start ? end : start + 0.5,
      text: '',
    },
  ].sort((a, b) => a.start - b.start)

  refreshCues()
  updateMarkers(cues)
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLTextAreaElement>(`textarea[data-cue="${id}"]`)?.focus()
  })
}

function updateCue(id: string, patch: Partial<Cue>) {
  cues = cues.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

function removeCue(id: string) {
  if (listeningCueId === id) stopActiveDictation()
  const cue = cues.find((c) => c.id === id)
  if (cue) revokeCueAudio(cue)
  cues = cues.filter((c) => c.id !== id)
  refreshCues()
  updateMarkers(cues)
}

function stopActiveDictation() {
  stopDictation?.()
  stopDictation = null
  listeningCueId = null
}

function toggleDictation(id: string) {
  if (!isSpeechSupported()) {
    showToast(t(lang, 'voiceUnsupported'))
    return
  }

  if (listeningCueId === id) {
    stopActiveDictation()
    refreshCues()
    return
  }

  stopActiveDictation()
  listeningCueId = id
  refreshCues()

  const base = cues.find((c) => c.id === id)?.text ?? ''
  const prefix = base.trim() ? `${base.trim()} ` : ''

  stopDictation = startDictation(
    lang,
    (partial) => {
      updateCue(id, { text: `${prefix}${partial}`.trim() })
      const ta = document.querySelector<HTMLTextAreaElement>(`textarea[data-cue="${id}"]`)
      if (ta) ta.value = cues.find((c) => c.id === id)?.text ?? ''
    },
    (finalText) => {
      updateCue(id, { text: `${prefix}${finalText}`.trim() })
    },
    () => {
      listeningCueId = null
      stopDictation = null
      refreshCues()
    },
    (code) => {
      showToast(code === 'unsupported' ? t(lang, 'voiceUnsupported') : t(lang, 'voiceError'))
    },
  )
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
  refreshCues()

  try {
    const blob = await synthesizeSpeech(cue.text, settings)
    const current = cues.find((c) => c.id === id)
    if (current) revokeCueAudio(current)
    const audioUrl = URL.createObjectURL(blob)
    updateCue(id, { generating: false, audioBlob: blob, audioUrl })
    showToast(t(lang, 'doneAudio'))
  } catch (err) {
    updateCue(id, { generating: false })
    showToast(`${t(lang, 'errorAudio')}: ${err instanceof Error ? err.message : String(err)}`)
  }
  refreshCues()
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
  const blob = new Blob([cuesToSrt(cues)], { type: 'text/plain;charset=utf-8' })
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
    zip.file(`${String(i + 1).padStart(3, '0')}_${formatFileTimestamp(c.start)}.mp3`, c.audioBlob!)
  })
  const timing = sorted
    .map(
      (c, i) =>
        `${String(i + 1).padStart(3, '0')}\t${formatClock(c.start)}\t${formatClock(c.end)}\t${c.text.replace(/\s+/g, ' ').trim()}`,
    )
    .join('\n')
  zip.file('timing.txt', `index\tstart\tend\ttext\n${timing}\n`)
  saveAs(await zip.generateAsync({ type: 'blob' }), `${videoName || 'narration'}_audio.zip`)
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
  settings = {
    apiKey: (document.getElementById('set-api') as HTMLInputElement).value,
    voiceId: (document.getElementById('set-voice') as HTMLInputElement).value,
    modelId: (document.getElementById('set-model') as HTMLInputElement).value,
  }
  saveSettings(settings)
  showToast(t(lang, 'saved'))
  closeSettings()
}

async function installPwa() {
  if (!deferredPrompt) return
  await deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  updateChromeTexts()
}

function cuesHtml(): string {
  if (!cues.length) {
    return `<div class="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">${t(lang, 'emptyCues')}</div>`
  }

  return cues
    .map((c) => {
      const listening = listeningCueId === c.id
      return `
      <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-id="${c.id}">
        <div class="mb-3 flex flex-wrap items-end gap-3">
          <label class="flex min-w-[7rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            ${t(lang, 'start')}
            <input data-field="start" value="${formatClock(c.start)}" class="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label class="flex min-w-[7rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            ${t(lang, 'end')}
            <input data-field="end" value="${formatClock(c.end)}" class="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="seek" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">${formatClock(c.start)}</button>
            <button type="button" data-action="generate" class="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50" ${c.generating ? 'disabled' : ''}>
              ${c.generating ? t(lang, 'generating') : t(lang, 'generate')}
            </button>
            ${
              c.audioUrl
                ? `<button type="button" data-action="play-audio" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">${t(lang, 'playAudio')}</button>`
                : ''
            }
            <button type="button" data-action="delete" class="rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">${t(lang, 'delete')}</button>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-600">${t(lang, 'text')}</span>
          <div class="flex items-start gap-2">
            <textarea data-cue="${c.id}" data-field="text" rows="2" placeholder="${t(lang, 'cuePlaceholder')}" class="min-w-0 flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">${escapeHtml(c.text)}</textarea>
            <div class="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                data-action="dictate"
                title="${t(lang, 'voiceInput')}"
                class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 ${listening ? 'listening' : ''}"
                aria-pressed="${listening ? 'true' : 'false'}"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true">
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 0-2 0 3 3 0 1 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V18H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A5 5 0 0 0 17 11Z"/>
                </svg>
                <span class="sr-only">${listening ? t(lang, 'voiceListening') : t(lang, 'voiceInput')}</span>
              </button>
              <button
                type="button"
                data-action="clear-text"
                title="${t(lang, 'clearText')}"
                class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12M10 11v6M14 11v6"/>
                </svg>
                <span class="sr-only">${t(lang, 'clearText')}</span>
              </button>
            </div>
          </div>
        </div>
        ${c.audioUrl ? `<audio class="mt-3 w-full" controls src="${c.audioUrl}"></audio>` : ''}
      </article>`
    })
    .join('')
}

function refreshCues() {
  const list = document.getElementById('cues-list')
  if (!list) return
  list.innerHTML = cuesHtml()
  bindCueEvents(list)
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
        if (field === 'start') {
          updateCue(id, { start: parsed })
          updateMarkers(cues)
        }
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
    card.querySelector('[data-action="dictate"]')?.addEventListener('click', () => toggleDictation(id))
    card.querySelector('[data-action="clear-text"]')?.addEventListener('click', () => {
      if (listeningCueId === id) stopActiveDictation()
      updateCue(id, { text: '' })
      const ta = card.querySelector<HTMLTextAreaElement>(`textarea[data-cue="${id}"]`)
      if (ta) {
        ta.value = ''
        ta.focus()
      }
      refreshCues()
    })
    card.querySelector('[data-action="seek"]')?.addEventListener('click', () => {
      const cue = cues.find((c) => c.id === id)
      if (cue) seekAndPlay(cue.start)
    })
    card.querySelector('[data-action="play-audio"]')?.addEventListener('click', () => {
      void card.querySelector('audio')?.play()
    })
  })
}

function updateChromeTexts() {
  const map: Array<[string, string]> = [
    ['txt-brand', t(lang, 'brand')],
    ['txt-tagline', t(lang, 'tagline')],
    ['btn-lang', t(lang, 'lang')],
    ['btn-settings', t(lang, 'settings')],
    ['txt-upload-title', t(lang, 'uploadTitle')],
    ['txt-upload-hint', t(lang, 'uploadHint')],
    ['txt-choose', t(lang, 'chooseVideo')],
    ['txt-change', t(lang, 'changeVideo')],
    ['btn-add-cue', t(lang, 'addCue')],
    ['btn-gen-all', t(lang, 'generateAll')],
    ['btn-dl-srt', t(lang, 'downloadSrt')],
    ['btn-dl-audio', t(lang, 'downloadAudio')],
    ['txt-time-hint', t(lang, 'timeHint')],
    ['txt-cues-title', t(lang, 'cues')],
    ['txt-settings-title', t(lang, 'settingsTitle')],
    ['txt-settings-hint', t(lang, 'settingsHint')],
    ['lbl-api', t(lang, 'apiKey')],
    ['lbl-voice', t(lang, 'voiceId')],
    ['lbl-model', t(lang, 'modelId')],
    ['btn-close-settings', t(lang, 'close')],
    ['btn-save-settings', t(lang, 'save')],
  ]
  for (const [id, text] of map) {
    const el = document.getElementById(id)
    if (el) el.textContent = text
  }
  const install = document.getElementById('btn-install')
  if (install) {
    install.textContent = t(lang, 'installPwa')
    install.classList.toggle('hidden', !deferredPrompt)
  }
  refreshCues()
}

function showWorkspace() {
  document.getElementById('upload-panel')?.classList.add('hidden')
  document.getElementById('workspace')?.classList.remove('hidden')
}

function showUpload() {
  document.getElementById('upload-panel')?.classList.remove('hidden')
  document.getElementById('workspace')?.classList.add('hidden')
}

function renderShell() {
  applyDir()
  root.innerHTML = `
    <div class="min-h-dvh">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div class="min-w-0">
            <p id="txt-brand" class="text-lg font-semibold tracking-tight text-slate-900">${t(lang, 'brand')}</p>
            <p id="txt-tagline" class="truncate text-sm text-slate-500">${t(lang, 'tagline')}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" id="btn-install" class="hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex">${t(lang, 'installPwa')}</button>
            <button type="button" id="btn-lang" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${t(lang, 'lang')}</button>
            <button type="button" id="btn-settings" class="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">${t(lang, 'settings')}</button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <section id="upload-panel" class="${videoUrl ? 'hidden' : ''} rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
          <h1 id="txt-upload-title" class="text-2xl font-semibold text-slate-900">${t(lang, 'uploadTitle')}</h1>
          <p id="txt-upload-hint" class="mx-auto mt-2 max-w-lg text-sm text-slate-500">${t(lang, 'uploadHint')}</p>
          <label class="mt-6 inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            <span id="txt-choose">${t(lang, 'chooseVideo')}</span>
            <input id="file-input-upload" type="file" accept="video/*" class="hidden" />
          </label>
        </section>

        <section id="workspace" class="${videoUrl ? '' : 'hidden'} space-y-6">
          <div id="player-host" class="mx-auto rounded-xl border border-slate-200 bg-slate-900 shadow-sm"></div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <span id="txt-change">${t(lang, 'changeVideo')}</span>
              <input id="file-input-change" type="file" accept="video/*" class="hidden" />
            </label>
            <button type="button" id="btn-add-cue" class="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">${t(lang, 'addCue')}</button>
            <button type="button" id="btn-gen-all" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${t(lang, 'generateAll')}</button>
            <button type="button" id="btn-dl-srt" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${t(lang, 'downloadSrt')}</button>
            <button type="button" id="btn-dl-audio" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${t(lang, 'downloadAudio')}</button>
          </div>
          <p id="txt-time-hint" class="text-sm text-slate-500">${t(lang, 'timeHint')}</p>

          <div>
            <h2 id="txt-cues-title" class="mb-3 text-lg font-semibold text-slate-900">${t(lang, 'cues')}</h2>
            <div id="cues-list" class="space-y-3"></div>
          </div>
        </section>
      </main>

      <div id="settings-modal" class="fixed inset-0 z-50 hidden" aria-hidden="true">
        <div id="settings-backdrop" class="absolute inset-0 bg-slate-900/40"></div>
        <div class="relative mx-auto mt-[12vh] max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <h2 id="txt-settings-title" class="text-lg font-semibold text-slate-900">${t(lang, 'settingsTitle')}</h2>
          <p id="txt-settings-hint" class="mt-1 text-sm text-slate-500">${t(lang, 'settingsHint')}</p>
          <form id="settings-form" class="mt-5 space-y-4">
            <label class="block text-sm font-medium text-slate-700">
              <span id="lbl-api">${t(lang, 'apiKey')}</span>
              <input id="set-api" type="password" autocomplete="off" value="${escapeHtml(settings.apiKey)}" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </label>
            <label class="block text-sm font-medium text-slate-700">
              <span id="lbl-voice">${t(lang, 'voiceId')}</span>
              <input id="set-voice" type="text" value="${escapeHtml(settings.voiceId)}" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" />
            </label>
            <label class="block text-sm font-medium text-slate-700">
              <span id="lbl-model">${t(lang, 'modelId')}</span>
              <select id="set-model" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="eleven_multilingual_v2" ${settings.modelId === 'eleven_multilingual_v2' ? 'selected' : ''}>eleven_multilingual_v2</option>
                <option value="eleven_turbo_v2_5" ${settings.modelId === 'eleven_turbo_v2_5' ? 'selected' : ''}>eleven_turbo_v2_5</option>
                <option value="eleven_flash_v2_5" ${settings.modelId === 'eleven_flash_v2_5' ? 'selected' : ''}>eleven_flash_v2_5</option>
                <option value="eleven_monolingual_v1" ${settings.modelId === 'eleven_monolingual_v1' ? 'selected' : ''}>eleven_monolingual_v1</option>
              </select>
            </label>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="btn-close-settings" class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${t(lang, 'close')}</button>
              <button type="submit" id="btn-save-settings" class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">${t(lang, 'save')}</button>
            </div>
          </form>
        </div>
      </div>

      <div id="toast" class="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white opacity-0 shadow-lg transition-opacity duration-300"></div>
    </div>
  `

  bindShellEvents()
  refreshCues()

  if (videoUrl) {
    showWorkspace()
    void mountPlayer()
  } else {
    showUpload()
  }
}

function bindShellEvents() {
  document.getElementById('btn-lang')?.addEventListener('click', () => {
    lang = lang === 'en' ? 'ar' : 'en'
    saveLang(lang)
    applyDir()
    updateChromeTexts()
  })
  document.getElementById('btn-settings')?.addEventListener('click', openSettings)
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings)
  document.getElementById('settings-backdrop')?.addEventListener('click', closeSettings)
  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    persistSettingsFromForm()
  })
  document.getElementById('btn-install')?.addEventListener('click', () => void installPwa())

  const onFile = (input: HTMLInputElement | null) => {
    input?.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file) setVideoFile(file)
      input.value = ''
    })
  }
  onFile(document.getElementById('file-input-upload') as HTMLInputElement | null)
  onFile(document.getElementById('file-input-change') as HTMLInputElement | null)

  const dropzone = document.getElementById('upload-panel')
  if (dropzone) {
    ;['dragenter', 'dragover'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault()
        dropzone.classList.add('ring-2', 'ring-blue-500')
      })
    })
    ;['dragleave', 'drop'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault()
        dropzone.classList.remove('ring-2', 'ring-blue-500')
      })
    })
    dropzone.addEventListener('drop', (e) => {
      const file = (e as DragEvent).dataTransfer?.files?.[0]
      if (file?.type.startsWith('video/')) setVideoFile(file)
    })
  }

  document.getElementById('btn-add-cue')?.addEventListener('click', addCueAtCurrent)
  document.getElementById('btn-gen-all')?.addEventListener('click', () => void generateAll())
  document.getElementById('btn-dl-srt')?.addEventListener('click', downloadSrt)
  document.getElementById('btn-dl-audio')?.addEventListener('click', () => void downloadAudioZip())
}

renderShell()

if ('serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })
}

import { DEFAULT_SETTINGS, STORAGE_KEYS, type ElevenSettings, type Lang } from './types'

export function loadSettings(): ElevenSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: ElevenSettings): void {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}

export function loadLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEYS.lang)
  return v === 'ar' ? 'ar' : 'en'
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(STORAGE_KEYS.lang, lang)
}

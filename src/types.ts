export type Lang = 'en' | 'ar'

export interface ElevenSettings {
  apiKey: string
  voiceId: string
  modelId: string
}

export interface Cue {
  id: string
  start: number
  end: number
  text: string
  audioBlob?: Blob
  audioUrl?: string
  generating?: boolean
}

export const DEFAULT_SETTINGS: ElevenSettings = {
  apiKey: '',
  voiceId: '',
  modelId: 'eleven_multilingual_v2',
}

export const STORAGE_KEYS = {
  settings: 'narrate_eleven_settings',
  lang: 'narrate_lang',
} as const

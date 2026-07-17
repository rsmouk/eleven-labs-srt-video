export type VoiceGender = 'male' | 'female' | 'unknown'

export interface AccountVoice {
  id: string
  name: string
  gender: VoiceGender
  category: string
}

interface ElevenVoiceDto {
  voice_id: string
  name: string
  category?: string
  labels?: Record<string, string>
  sharing?: { status?: string } | null
}

/** Categories usable on free API plans (not Voice Library community voices). */
const FREE_API_CATEGORIES = new Set(['premade', 'cloned', 'generated'])

/**
 * Default voices usable when the API key lacks `voices_read`.
 * Prefer these over Voice Library IDs which free API rejects.
 */
export const FALLBACK_FREE_VOICES: AccountVoice[] = [
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', category: 'premade' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female', category: 'premade' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', category: 'premade' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', category: 'premade' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', category: 'premade' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male', category: 'premade' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', category: 'premade' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'male', category: 'premade' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', category: 'premade' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'male', category: 'premade' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', category: 'premade' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', category: 'premade' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', category: 'premade' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male', category: 'premade' },
]

export function isVoicesReadPermissionError(message: string): boolean {
  return /voices_read/i.test(message) || /missing the permission/i.test(message)
}

export async function fetchAccountVoices(apiKey: string): Promise<AccountVoice[]> {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': apiKey.trim(),
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as { detail?: { message?: string } | string }
      if (typeof err.detail === 'string') detail = err.detail
      else if (err.detail && typeof err.detail === 'object' && err.detail.message) {
        detail = err.detail.message
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }

  const data = (await res.json()) as { voices?: ElevenVoiceDto[] }
  const voices = data.voices ?? []

  return voices
    .filter((v) => {
      const category = (v.category || '').toLowerCase()
      if (v.sharing?.status === 'copied') return false
      return FREE_API_CATEGORIES.has(category)
    })
    .map((v) => {
      const rawGender = (v.labels?.gender || '').toLowerCase()
      const gender: VoiceGender =
        rawGender === 'male' || rawGender === 'female' ? rawGender : 'unknown'
      return {
        id: v.voice_id,
        name: v.name,
        gender,
        category: (v.category || 'premade').toLowerCase(),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function voiceOptionLabel(
  voice: AccountVoice,
  maleLabel: string,
  femaleLabel: string,
  unknownLabel: string,
): string {
  const gender =
    voice.gender === 'male' ? maleLabel : voice.gender === 'female' ? femaleLabel : unknownLabel
  return `${voice.name} — ${gender}`
}

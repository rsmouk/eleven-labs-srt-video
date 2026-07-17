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
      // Skip Voice Library copies — free API rejects them
      if (v.sharing?.status === 'copied') return false
      // Default premade + own clones/generated (Voice Design)
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

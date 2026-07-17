import type { ElevenSettings } from './types'

export async function synthesizeSpeech(
  text: string,
  settings: ElevenSettings,
): Promise<Blob> {
  if (!settings.apiKey.trim() || !settings.voiceId.trim()) {
    throw new Error('Missing API key or voice ID')
  }
  if (!text.trim()) {
    throw new Error('Empty text')
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.voiceId.trim())}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': settings.apiKey.trim(),
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: settings.modelId.trim() || 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
        },
      }),
    },
  )

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

  return res.blob()
}

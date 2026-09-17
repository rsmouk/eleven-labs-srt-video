import type { Lang } from './types'

/** Audio tags supported by ElevenLabs eleven_v3 model. */
export const AUDIO_TAGS = [
  '[laughs]',
  '[sighs]',
  '[whispers]',
  '[shouts]',
  '[clears throat]',
  '[curious]',
  '[excited]',
  '[sad]',
  '[angry]',
  '[happily]',
  '[crying]',
  '[tired]',
  '[sarcastically]',
  '[pause]',
] as const

export type AudioTag = (typeof AUDIO_TAGS)[number]

const AUDIO_TAG_LABELS: Record<AudioTag, Record<Lang, string>> = {
  '[laughs]': { en: 'Laughs', ar: 'ضحك' },
  '[sighs]': { en: 'Sighs', ar: 'تنهيدة' },
  '[whispers]': { en: 'Whispers', ar: 'همس' },
  '[shouts]': { en: 'Shouts', ar: 'صراخ' },
  '[clears throat]': { en: 'Clears throat', ar: 'تنحنح' },
  '[curious]': { en: 'Curious', ar: 'فضول' },
  '[excited]': { en: 'Excited', ar: 'حماس' },
  '[sad]': { en: 'Sad', ar: 'حزن' },
  '[angry]': { en: 'Angry', ar: 'غضب' },
  '[happily]': { en: 'Happily', ar: 'سعادة' },
  '[crying]': { en: 'Crying', ar: 'بكاء' },
  '[tired]': { en: 'Tired', ar: 'تعب' },
  '[sarcastically]': { en: 'Sarcastic', ar: 'سخرية' },
  '[pause]': { en: 'Pause', ar: 'وقفة' },
}

export function audioTagLabel(tag: AudioTag, lang: Lang): string {
  return AUDIO_TAG_LABELS[tag][lang]
}

export function modelSupportsAudioTags(modelId: string): boolean {
  return modelId.trim().toLowerCase().startsWith('eleven_v3')
}

export function insertAtCursor(textarea: HTMLTextAreaElement, snippet: string): void {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? start
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before)
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after)
  const insert = `${needsSpaceBefore ? ' ' : ''}${snippet}${needsSpaceAfter ? ' ' : ''}`
  textarea.value = `${before}${insert}${after}`
  const caret = before.length + insert.length
  textarea.focus()
  textarea.setSelectionRange(caret, caret)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

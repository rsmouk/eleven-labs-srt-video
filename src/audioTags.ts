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

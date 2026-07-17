export type VoiceGender = 'male' | 'female'

export interface FreeVoice {
  id: string
  name: string
  gender: VoiceGender
}

/** Well-known ElevenLabs premade voices available on free plans. */
export const FREE_VOICES: FreeVoice[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male' },
]

export function voiceOptionLabel(
  voice: FreeVoice,
  maleLabel: string,
  femaleLabel: string,
): string {
  const gender = voice.gender === 'male' ? maleLabel : femaleLabel
  return `${voice.name} — ${gender}`
}

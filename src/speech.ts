import type { Lang } from './types'

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly 0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: Event) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechSupported(): boolean {
  return Boolean(getSpeechRecognition())
}

export function startDictation(
  lang: Lang,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): () => void {
  const Ctor = getSpeechRecognition()
  if (!Ctor) {
    onError('unsupported')
    return () => undefined
  }

  const recognition = new Ctor()
  recognition.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
  recognition.continuous = true
  recognition.interimResults = true

  let finalChunk = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const piece = result[0]?.transcript ?? ''
      if (result.isFinal) finalChunk += piece
      else interim += piece
    }
    const combined = `${finalChunk}${interim}`.trim()
    if (combined) onPartial(combined)
  }

  recognition.onerror = () => {
    onError('error')
    onEnd()
  }

  recognition.onend = () => {
    const text = finalChunk.trim()
    if (text) onFinal(text)
    onEnd()
  }

  try {
    recognition.start()
  } catch {
    onError('error')
    onEnd()
  }

  return () => {
    try {
      recognition.stop()
    } catch {
      /* ignore */
    }
  }
}

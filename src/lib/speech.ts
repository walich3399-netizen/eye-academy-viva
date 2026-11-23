export function sttSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
}
export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export interface Listener {
  stop(): void
}

export function listen(h: {
  onInterim: (t: string) => void
  onFinal: (t: string) => void
  onEnd: () => void
  onError: (msg: string) => void
}): Listener {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const rec = new Ctor()
  rec.lang = 'en-GB'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  let finalText = ''
  let delivered = false
  rec.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += r[0].transcript
      else interim += r[0].transcript
    }
    if (interim) h.onInterim(interim)
    if (finalText && !delivered && e.results[e.results.length - 1].isFinal) {
      delivered = true
      h.onFinal(finalText.trim())
    }
  }
  rec.onerror = (e: any) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') h.onError(e.error)
  }
  rec.onend = () => h.onEnd()
  rec.start()
  return { stop: () => rec.stop() }
}

let voice: SpeechSynthesisVoice | null = null
function pickVoice() {
  if (voice) return voice
  const vs = window.speechSynthesis.getVoices()
  voice = vs.find((v) => v.lang === 'en-GB') ?? vs.find((v) => v.lang.startsWith('en')) ?? null
  return voice
}

export function speak(text: string, h: { onStart?: () => void; onEnd?: () => void }) {
  if (!ttsSupported()) {
    h.onStart?.()
    h.onEnd?.()
    return
  }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice()
  if (v) u.voice = v
  u.lang = 'en-GB'
  u.rate = 1
  u.onstart = () => h.onStart?.()
  u.onend = () => h.onEnd?.()
  u.onerror = () => h.onEnd?.()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel()
}

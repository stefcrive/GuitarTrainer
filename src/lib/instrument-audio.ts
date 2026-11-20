export const INSTRUMENTS = [
  { id: 'acoustic_guitar_nylon', label: 'Nylon guitar' },
  { id: 'acoustic_guitar_steel', label: 'Steel guitar' },
  { id: 'acoustic_grand_piano', label: 'Grand piano' },
  { id: 'electric_piano_1', label: 'Electric piano' },
  { id: 'sine', label: 'Sine' }, { id: 'triangle', label: 'Triangle' },
  { id: 'square', label: 'Square' }, { id: 'sawtooth', label: 'Sawtooth' },
] as const
export type Instrument = typeof INSTRUMENTS[number]['id']
export const isInstrument = (value: unknown): value is Instrument => INSTRUMENTS.some(item => item.id === value)
const banks = new Map<string, Promise<Record<string, string>>>()
const decoded = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>()
const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const sampleMidi = (midi: number) => Math.min(108, Math.max(21, Math.round(midi)))
const sampleName = (midi: number) => `${names[midi % 12]}${Math.floor(midi / 12) - 1}`

async function sample(context: BaseAudioContext, instrument: Instrument, midi: number) {
  if (!banks.has(instrument)) banks.set(instrument, fetch(`/sounds/${instrument}.json`).then(async response => {
    if (!response.ok) throw new Error('Instrument samples could not load. Try again or select Sine.')
    return response.json()
  }).catch(error => { banks.delete(instrument); throw error }))
  let cache = decoded.get(context)
  if (!cache) { cache = new Map(); decoded.set(context, cache) }
  const key = `${instrument}:${sampleMidi(midi)}`
  if (!cache.has(key)) cache.set(key, (async () => {
    const bank = await banks.get(instrument)!
    const encoded = bank[sampleName(sampleMidi(midi))]?.split(',')[1]
    if (!encoded) throw new Error('Instrument sample is missing. Select another sound.')
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
    return context.decodeAudioData(bytes.buffer)
  })().catch(error => { cache!.delete(key); throw error }))
  return cache.get(key)!
}

export interface InstrumentVoice { source: AudioScheduledSourceNode; gain: GainNode }
export async function prepareInstrument(context: BaseAudioContext, instrument: Instrument, pitches: number[]) {
  const sampled = !['sine', 'triangle', 'square', 'sawtooth'].includes(instrument)
  const buffers = new Map<number, AudioBuffer>()
  if (sampled) await Promise.all([...new Set(pitches.map(sampleMidi))].map(async midi => buffers.set(midi, await sample(context, instrument, midi))))
  return (midi: number, when: number, duration: number, volume: number, outputs: AudioNode[] = [context.destination]): InstrumentVoice => {
    const gain = context.createGain()
    let source: AudioBufferSourceNode | OscillatorNode
    if (sampled) {
      const buffer = buffers.get(sampleMidi(midi))
      if (!buffer) throw new Error('Instrument was not prepared for this pitch.')
      const node = context.createBufferSource(); node.buffer = buffer
      node.playbackRate.value = 2 ** ((midi - sampleMidi(midi)) / 12); source = node
    } else {
      const node = context.createOscillator(); node.type = instrument as OscillatorType
      node.frequency.value = 440 * 2 ** ((midi - 69) / 12); source = node
    }
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), when + Math.min(0.006, duration / 4))
    gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), when + Math.max(0.007, duration - 0.03))
    gain.gain.linearRampToValueAtTime(0, when + duration + 0.06)
    source.connect(gain); outputs.forEach(output => gain.connect(output))
    source.onended = () => { source.disconnect(); gain.disconnect() }
    source.start(when); source.stop(when + duration + 0.07)
    return { source, gain }
  }
}

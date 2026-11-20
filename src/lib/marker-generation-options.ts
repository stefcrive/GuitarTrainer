export type MarkerGenerationOptions = {
  preset: 'lessons' | 'repertoire' | 'devices'
  customPrompt: string
  transcriptionMode: 'fast' | 'standard'
}

export const defaultMarkerOptions: MarkerGenerationOptions = {
  preset: 'lessons', customPrompt: '', transcriptionMode: 'fast'
}

export function parseMarkerOptions(value: unknown): MarkerGenerationOptions {
  if (value === undefined) return { ...defaultMarkerOptions }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid marker generation options.')
  const options = value as Record<string, unknown>
  const preset = options.preset ?? 'lessons'
  const customPrompt = options.customPrompt ?? ''
  const transcriptionMode = options.transcriptionMode ?? 'fast'
  if (!['lessons', 'repertoire', 'devices'].includes(preset as string)) throw new Error('Choose a valid segmentation preset.')
  if (typeof customPrompt !== 'string' || customPrompt.length > 4000 || customPrompt.includes('\0')) {
    throw new Error('Custom segmentation instructions must be text of up to 4,000 characters.')
  }
  if (!['fast', 'standard'].includes(transcriptionMode as string)) throw new Error('Choose a valid transcription mode.')
  return { preset: preset as MarkerGenerationOptions['preset'], customPrompt: customPrompt.trim(),
    transcriptionMode: transcriptionMode as MarkerGenerationOptions['transcriptionMode'] }
}

export function youtubeProcessorArgs(video: { videoId: string; duration: number; title: string }, output: string) {
  // Bind values explicitly: YouTube IDs and titles can start with a hyphen.
  return ['youtube_markers.py', `--video-id=${video.videoId}`, `--duration=${video.duration}`,
    `--title=${video.title}`, `--output=${output}`]
}

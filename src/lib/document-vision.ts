import { getMarkerGenerationEnv } from '@/lib/marker-generation-settings'
import { NOTATION_MODEL, notationPrompt, notationSchema, visionScoreToMusicXml } from '@/lib/document-vision-score'

export async function recognizeNotationWithGpt(image: Uint8Array, signal: AbortSignal) {
  const key = (await getMarkerGenerationEnv()).OPENAI_API_KEY
  if (!key) throw new Error('Add your OpenAI API key in Settings > AI services and marker generation.')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
    body: JSON.stringify({ model: NOTATION_MODEL, store: false, reasoning: { effort: 'low' }, max_output_tokens: 32000,
      instructions: notationPrompt,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Transcribe this captured notation image, beginning with the first visible measure.' }, { type: 'input_image', detail: 'high', image_url: `data:image/png;base64,${Buffer.from(image).toString('base64')}` }] }],
      text: { format: { type: 'json_schema', name: 'notation_score', strict: true, schema: notationSchema } },
    }),
  })
  if (!response.ok) {
    // Do not forward arbitrary upstream bodies containing credential or document details.
    if (response.status === 401) throw new Error('OpenAI rejected the API key. Update it in Settings.')
    if ([403,404].includes(response.status)) throw new Error(`Your OpenAI project cannot access ${NOTATION_MODEL}. Check model access and project permissions.`)
    if (response.status === 429) throw new Error('OpenAI quota or rate limit reached. Check billing or try again later.')
    throw new Error(`OpenAI notation request failed (HTTP ${response.status}). Try a smaller selection.`)
  }
  const data = await response.json()
  const content = (data.output ?? []).filter((item: any) => item.type === 'message').flatMap((item: any) => item.content ?? [])
  if (content.some((item: any) => item.type === 'refusal')) throw new Error('OpenAI declined this image transcription.')
  if (data.status !== 'completed') throw new Error('GPT could not finish the transcription. Select fewer measures and try again.')
  const text = content.filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join('')
  let structured: unknown
  try { structured = JSON.parse(text) } catch { throw new Error('GPT returned no valid structured score. Try a smaller selection.') }
  return [visionScoreToMusicXml(structured)]
}

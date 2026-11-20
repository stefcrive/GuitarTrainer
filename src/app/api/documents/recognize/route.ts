import { NextRequest, NextResponse } from 'next/server'
import { recognizeNotationWithGpt } from '@/lib/document-vision'
import { getMarkerGenerationSettings } from '@/lib/marker-generation-settings'
import { NOTATION_MODEL } from '@/lib/document-vision-score'
import { findAudiveris, recognizeNotation } from '@/lib/document-omr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 320
const state = globalThis as typeof globalThis & { documentOmrBusy?: boolean }

export async function GET() {
  return NextResponse.json({ gptConfigured: (await getMarkerGenerationSettings()).openaiConfigured, model: NOTATION_MODEL, available: Boolean(await findAudiveris()), engine: 'Audiveris', setup: 'npm run documents:omr' })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  let sameOrigin = false
  try { sameOrigin = Boolean(origin && new URL(origin).host === request.headers.get('host')) } catch {}
  if (!sameOrigin) return NextResponse.json({ error: 'Same-origin requests are required.' }, { status: 403 })
  if (request.headers.get('content-type') !== 'image/png') return NextResponse.json({ error: 'Upload a PNG selection.' }, { status: 415 })
  if (Number(request.headers.get('content-length')) > 12_000_000) return NextResponse.json({ error: 'Selection is too large. Select a smaller region.' }, { status: 413 })
  const engine = request.nextUrl.searchParams.get('engine') ?? 'audiveris'
  if (!['audiveris', 'gpt'].includes(engine)) return NextResponse.json({ error: 'Unknown recognition engine.' }, { status: 400 })
  const executable = engine === 'audiveris' ? await findAudiveris() : null
  if (engine === 'audiveris' && !executable) return NextResponse.json({ error: 'Music recognition needs Audiveris. Run npm run documents:omr on Windows, or set AUDIVERIS_PATH to your Audiveris executable.' }, { status: 503 })
  if (state.documentOmrBusy) return NextResponse.json({ error: 'Music recognition is already running. Try again when it finishes.' }, { status: 409 })
  state.documentOmrBusy = true
  try {
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'Empty selection.' }, { status: 400 })
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 12_000_000) { await reader.cancel(); return NextResponse.json({ error: 'Selection exceeds 12 MB.' }, { status: 413 }) }
      chunks.push(value)
    }
    const bytes = Buffer.concat(chunks)
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16_000_000) return NextResponse.json({ error: 'Invalid or oversized PNG image.' }, { status: 400 })
    return NextResponse.json({ scores: engine === 'gpt' ? await recognizeNotationWithGpt(bytes, request.signal) : await recognizeNotation(executable!, bytes, request.signal) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Music recognition failed.' }, { status: 422 })
  } finally { state.documentOmrBusy = false }
}

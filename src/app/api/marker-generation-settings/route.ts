import { NextRequest, NextResponse } from 'next/server'
import { getMarkerGenerationSettings, saveMarkerGenerationSettings } from '@/lib/marker-generation-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getMarkerGenerationSettings(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to read marker generation settings.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // This app runs locally. Reject cross-origin writes to its server-side credential file.
  const origin = request.headers.get('origin')
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== request.headers.get('host')) {
    return NextResponse.json({ error: 'Settings must be saved from this application.' }, { status: 403 })
  }
  try {
    const body = await request.json()
    if (!body || !['llm', 'jev'].includes(body.provider)) {
      return NextResponse.json({ error: 'Choose a valid decision provider.' }, { status: 400 })
    }
    for (const key of ['jevApiKey', 'openaiApiKey']) {
      if (body[key] !== undefined && (typeof body[key] !== 'string' || !/^[A-Za-z0-9_.-]{0,512}$/.test(body[key]))) {
        return NextResponse.json({ error: 'API keys must contain only letters, numbers, dots, hyphens, or underscores.' }, { status: 400 })
      }
    }
    await saveMarkerGenerationSettings({
      provider: body.provider,
      jevApiKey: body.jevApiKey,
      openaiApiKey: body.openaiApiKey
    })
    return NextResponse.json(await getMarkerGenerationSettings())
  } catch {
    return NextResponse.json({ error: 'Unable to save marker generation settings.' }, { status: 500 })
  }
}

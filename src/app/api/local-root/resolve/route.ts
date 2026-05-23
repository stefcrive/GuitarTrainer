import { NextRequest, NextResponse } from 'next/server'
import { resolveLocalRootPath } from '@/lib/server-root-registry'

export const runtime = 'nodejs'

type ResolveRootRequest = {
  rootName?: string
  samplePaths?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResolveRootRequest
    const rootName = body.rootName?.trim()
    if (!rootName) {
      return NextResponse.json({ error: 'rootName is required.' }, { status: 400 })
    }

    const rootPath = await resolveLocalRootPath({
      rootName,
      samplePaths: body.samplePaths ?? []
    })

    if (!rootPath) {
      return NextResponse.json(
        {
          error:
            `Could not resolve "${rootName}" to a local disk path. ` +
            'Move it under your user Videos/Documents folder or set GUITAR_TRAINER_VIDEO_ROOT in .env.local.'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, rootPath })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to resolve local root path.' },
      { status: 500 }
    )
  }
}

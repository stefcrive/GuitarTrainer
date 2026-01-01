import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSpotifyConfig } from '@/lib/spotify-api'
import { SP_ACCESS_TOKEN_COOKIE, SP_REFRESH_TOKEN_COOKIE } from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

export async function GET() {
  const { configured } = getSpotifyConfig()
  const cookieStore = cookies()
  const accessToken = cookieStore.get(SP_ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = cookieStore.get(SP_REFRESH_TOKEN_COOKIE)?.value

  return NextResponse.json({
    configured,
    authorized: Boolean(accessToken || refreshToken)
  })
}

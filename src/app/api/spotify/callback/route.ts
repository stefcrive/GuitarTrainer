import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getSpotifyOAuthConfig,
  getBaseUrl,
  getCookieOptions,
  SP_ACCESS_TOKEN_COOKIE,
  SP_EXPIRES_AT_COOKIE,
  SP_REDIRECT_COOKIE,
  SP_REFRESH_TOKEN_COOKIE,
  SP_STATE_COOKIE
} from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, configured, redirectUri } = getSpotifyOAuthConfig()

  if (!configured || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Spotify OAuth is not configured.' }, { status: 500 })
  }

  const oauthError = request.nextUrl.searchParams.get('error')
  if (oauthError) {
    return NextResponse.json({ error: oauthError }, { status: 400 })
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookieStore = cookies()
  const storedState = cookieStore.get(SP_STATE_COOKIE)?.value

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code.' }, { status: 400 })
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.json({ error: 'Invalid OAuth state.' }, { status: 400 })
  }

  const baseUrl = getBaseUrl(request)
  const resolvedRedirectUri = redirectUri ?? `${baseUrl}/api/spotify/callback`

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      redirect_uri: resolvedRedirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code'
    })
  })

  const tokenText = await tokenResponse.text()
  if (!tokenResponse.ok) {
    return NextResponse.json({ error: 'Failed to exchange OAuth code.', details: tokenText }, { status: 500 })
  }

  let tokenData: any
  try {
    tokenData = tokenText ? JSON.parse(tokenText) : null
  } catch {
    return NextResponse.json({ error: 'Invalid token response.', details: tokenText }, { status: 500 })
  }

  const accessToken = tokenData.access_token as string | undefined
  const refreshToken = tokenData.refresh_token as string | undefined
  const expiresIn = Number(tokenData.expires_in ?? 0)

  if (!accessToken || !expiresIn) {
    return NextResponse.json({ error: 'Invalid token payload.', details: tokenData }, { status: 500 })
  }

  const existingRefreshToken = cookieStore.get(SP_REFRESH_TOKEN_COOKIE)?.value
  const resolvedRefreshToken = refreshToken || existingRefreshToken
  const expiresAt = Date.now() + expiresIn * 1000
  const redirectPath = cookieStore.get(SP_REDIRECT_COOKIE)?.value || '/spotify'

  const response = NextResponse.redirect(new URL(redirectPath, baseUrl))
  response.cookies.set(SP_ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(expiresIn))
  response.cookies.set(SP_EXPIRES_AT_COOKIE, `${expiresAt}`, getCookieOptions(expiresIn))

  if (resolvedRefreshToken) {
    response.cookies.set(SP_REFRESH_TOKEN_COOKIE, resolvedRefreshToken, getCookieOptions(60 * 60 * 24 * 30))
  }

  response.cookies.delete(SP_STATE_COOKIE)
  response.cookies.delete(SP_REDIRECT_COOKIE)

  return response
}

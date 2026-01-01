import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getOAuthConfig,
  getBaseUrl,
  getCookieOptions,
  YT_ACCESS_TOKEN_COOKIE,
  YT_EXPIRES_AT_COOKIE,
  YT_REDIRECT_COOKIE,
  YT_REFRESH_TOKEN_COOKIE,
  YT_STATE_COOKIE
} from '@/lib/youtube-oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, configured, redirectUri } = getOAuthConfig()

  if (!configured || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'YouTube OAuth is not configured.' }, { status: 500 })
  }

  const oauthError = request.nextUrl.searchParams.get('error')
  if (oauthError) {
    return NextResponse.json({ error: oauthError }, { status: 400 })
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookieStore = cookies()
  const storedState = cookieStore.get(YT_STATE_COOKIE)?.value

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code.' }, { status: 400 })
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.json({ error: 'Invalid OAuth state.' }, { status: 400 })
  }

  const baseUrl = getBaseUrl(request)
  const resolvedRedirectUri = redirectUri ?? `${baseUrl}/api/youtube/callback`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: resolvedRedirectUri,
      grant_type: 'authorization_code'
    })
  })

  const tokenText = await tokenResponse.text()
  if (!tokenResponse.ok) {
    return NextResponse.json({ error: 'Failed to exchange OAuth code.', details: tokenText }, { status: 500 })
  }

  let tokenData: any
  try {
    tokenData = JSON.parse(tokenText)
  } catch {
    return NextResponse.json({ error: 'Invalid token response.', details: tokenText }, { status: 500 })
  }

  const accessToken = tokenData.access_token as string | undefined
  const refreshToken = tokenData.refresh_token as string | undefined
  const expiresIn = Number(tokenData.expires_in ?? 0)

  if (!accessToken || !expiresIn) {
    return NextResponse.json({ error: 'Invalid token payload.', details: tokenData }, { status: 500 })
  }

  const existingRefreshToken = cookieStore.get(YT_REFRESH_TOKEN_COOKIE)?.value
  const resolvedRefreshToken = refreshToken || existingRefreshToken
  const expiresAt = Date.now() + expiresIn * 1000
  const redirectPath = cookieStore.get(YT_REDIRECT_COOKIE)?.value || '/settings'

  const response = NextResponse.redirect(new URL(redirectPath, baseUrl))
  response.cookies.set(YT_ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(expiresIn))
  response.cookies.set(YT_EXPIRES_AT_COOKIE, `${expiresAt}`, getCookieOptions(expiresIn))

  if (resolvedRefreshToken) {
    response.cookies.set(YT_REFRESH_TOKEN_COOKIE, resolvedRefreshToken, getCookieOptions(60 * 60 * 24 * 30))
  }

  response.cookies.delete(YT_STATE_COOKIE)
  response.cookies.delete(YT_REDIRECT_COOKIE)

  return response
}

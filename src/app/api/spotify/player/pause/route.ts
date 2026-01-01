import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getSpotifyOAuthConfig,
  getCookieOptions,
  SP_ACCESS_TOKEN_COOKIE,
  SP_EXPIRES_AT_COOKIE,
  SP_REFRESH_TOKEN_COOKIE
} from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  })

  const text = await response.text()
  if (!response.ok) {
    console.error('Spotify refresh error', text)
    return null
  }

  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    console.error('Spotify refresh parse error', text)
    return null
  }

  if (!data?.access_token || !data?.expires_in) {
    return null
  }

  const expiresIn = Number(data.expires_in)
  const expiresAt = Date.now() + expiresIn * 1000

  return {
    accessToken: data.access_token as string,
    expiresIn,
    expiresAt
  }
}

function applyRefreshedCookies(
  response: NextResponse,
  refreshed: { accessToken: string; expiresIn: number; expiresAt: number }
) {
  response.cookies.set(SP_ACCESS_TOKEN_COOKIE, refreshed.accessToken, getCookieOptions(refreshed.expiresIn))
  response.cookies.set(SP_EXPIRES_AT_COOKIE, `${refreshed.expiresAt}`, getCookieOptions(refreshed.expiresIn))
}

export async function PUT(request: NextRequest) {
  const { clientId, clientSecret, configured } = getSpotifyOAuthConfig()

  if (!configured || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Spotify OAuth is not configured.' }, { status: 500 })
  }

  const cookieStore = cookies()
  const accessTokenCookie = cookieStore.get(SP_ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = cookieStore.get(SP_REFRESH_TOKEN_COOKIE)?.value
  const expiresAt = Number(cookieStore.get(SP_EXPIRES_AT_COOKIE)?.value)

  const tokenExpired = !accessTokenCookie || !expiresAt || Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
  let accessToken = accessTokenCookie
  let refreshedTokens: { accessToken: string; expiresIn: number; expiresAt: number } | null = null

  if (tokenExpired) {
    if (!refreshToken) {
      return NextResponse.json({ error: 'Spotify account not connected.' }, { status: 401 })
    }

    const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
    if (!refreshed) {
      return NextResponse.json({ error: 'Failed to refresh access token.' }, { status: 401 })
    }

    accessToken = refreshed.accessToken
    refreshedTokens = refreshed
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Spotify account not connected.' }, { status: 401 })
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const { deviceId } = body

  const url = new URL('https://api.spotify.com/v1/me/player/pause')
  if (deviceId) {
    url.searchParams.set('device_id', deviceId)
  }

  const apiResponse = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!apiResponse.ok && apiResponse.status !== 204) {
    const text = await apiResponse.text()
    const response = NextResponse.json(
      { error: 'Spotify API error.', details: text || apiResponse.statusText },
      { status: apiResponse.status }
    )
    if (refreshedTokens) {
      applyRefreshedCookies(response, refreshedTokens)
    }
    return response
  }

  const response = NextResponse.json({ ok: true })
  if (refreshedTokens) {
    applyRefreshedCookies(response, refreshedTokens)
  }
  return response
}

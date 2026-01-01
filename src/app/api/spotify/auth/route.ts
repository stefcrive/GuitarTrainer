import { NextRequest, NextResponse } from 'next/server'
import {
  getSpotifyOAuthConfig,
  getBaseUrl,
  getCookieOptions,
  sanitizeRedirect,
  SPOTIFY_OAUTH_SCOPES,
  SP_REDIRECT_COOKIE,
  SP_STATE_COOKIE
} from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { clientId, configured, redirectUri } = getSpotifyOAuthConfig()

  if (!configured || !clientId) {
    return NextResponse.json({ error: 'Spotify OAuth is not configured.' }, { status: 500 })
  }

  const baseUrl = getBaseUrl(request)
  const resolvedRedirectUri = redirectUri ?? `${baseUrl}/api/spotify/callback`
  const state = crypto.randomUUID()

  const redirectParam = request.nextUrl.searchParams.get('redirect')
  const referer = request.headers.get('referer')
  const redirectPath =
    sanitizeRedirect(request, redirectParam) ||
    sanitizeRedirect(request, referer) ||
    '/spotify'

  const authUrl = new URL('https://accounts.spotify.com/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', resolvedRedirectUri)
  authUrl.searchParams.set('scope', SPOTIFY_OAUTH_SCOPES.join(' '))
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('show_dialog', 'false')

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set(SP_STATE_COOKIE, state, getCookieOptions(600))
  response.cookies.set(SP_REDIRECT_COOKIE, redirectPath, getCookieOptions(600))
  return response
}

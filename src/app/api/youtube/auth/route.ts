import { NextRequest, NextResponse } from 'next/server'
import {
  getOAuthConfig,
  getBaseUrl,
  getCookieOptions,
  sanitizeRedirect,
  YT_OAUTH_SCOPES,
  YT_REDIRECT_COOKIE,
  YT_STATE_COOKIE
} from '@/lib/youtube-oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { clientId, configured, redirectUri } = getOAuthConfig()

  if (!configured || !clientId) {
    return NextResponse.json({ error: 'YouTube OAuth is not configured.' }, { status: 500 })
  }

  const baseUrl = getBaseUrl(request)
  const resolvedRedirectUri = redirectUri ?? `${baseUrl}/api/youtube/callback`
  const state = crypto.randomUUID()

  const redirectParam = request.nextUrl.searchParams.get('redirect')
  const referer = request.headers.get('referer')
  const redirectPath =
    sanitizeRedirect(request, redirectParam) ||
    sanitizeRedirect(request, referer) ||
    '/settings'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', resolvedRedirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', YT_OAUTH_SCOPES.join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('include_granted_scopes', 'true')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set(YT_STATE_COOKIE, state, getCookieOptions(600))
  response.cookies.set(YT_REDIRECT_COOKIE, redirectPath, getCookieOptions(600))
  return response
}

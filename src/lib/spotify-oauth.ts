import type { NextRequest } from 'next/server'

export const SP_ACCESS_TOKEN_COOKIE = 'sp_access_token'
export const SP_REFRESH_TOKEN_COOKIE = 'sp_refresh_token'
export const SP_EXPIRES_AT_COOKIE = 'sp_token_expires_at'
export const SP_STATE_COOKIE = 'sp_oauth_state'
export const SP_REDIRECT_COOKIE = 'sp_oauth_redirect'

export const SPOTIFY_OAUTH_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state'
]

export interface SpotifyOAuthConfig {
  clientId: string | null
  clientSecret: string | null
  redirectUri: string | null
  configured: boolean
}

export function getSpotifyOAuthConfig(): SpotifyOAuthConfig {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? null
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? null
  const redirectUri = process.env.SPOTIFY_OAUTH_REDIRECT_URI ?? null

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret)
  }
}

export function getBaseUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return request.nextUrl.origin
}

export function sanitizeRedirect(request: NextRequest, redirect: string | null): string | null {
  if (!redirect) return null

  if (redirect.startsWith('/')) {
    return redirect
  }

  try {
    const url = new URL(redirect)
    if (url.origin === getBaseUrl(request)) {
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    return null
  }

  return null
}

export function getCookieOptions(maxAgeSeconds?: number) {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {})
  }
}

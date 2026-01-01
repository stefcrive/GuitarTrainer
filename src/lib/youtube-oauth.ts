import type { NextRequest } from 'next/server'

export const YT_ACCESS_TOKEN_COOKIE = 'yt_access_token'
export const YT_REFRESH_TOKEN_COOKIE = 'yt_refresh_token'
export const YT_EXPIRES_AT_COOKIE = 'yt_token_expires_at'
export const YT_STATE_COOKIE = 'yt_oauth_state'
export const YT_REDIRECT_COOKIE = 'yt_oauth_redirect'

export const YT_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly'
]

export interface OAuthConfig {
  clientId: string | null
  clientSecret: string | null
  redirectUri: string | null
  configured: boolean
}

export function getOAuthConfig(): OAuthConfig {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? null
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? null
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI ?? null

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

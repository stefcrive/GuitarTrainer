interface SpotifyConfig {
  clientId: string | null
  clientSecret: string | null
  configured: boolean
}

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000

let cachedAccessToken: string | null = null
let cachedExpiresAt = 0

export function getSpotifyConfig(): SpotifyConfig {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? process.env.SPOTIFY_CLIENT_ID ?? null
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? null

  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret)
  }
}

export async function getAppAccessToken(): Promise<string> {
  const { clientId, clientSecret, configured } = getSpotifyConfig()

  if (!configured || !clientId || !clientSecret) {
    throw new Error('Spotify client ID/secret are not configured.')
  }

  const now = Date.now()
  if (cachedAccessToken && cachedExpiresAt - TOKEN_EXPIRY_BUFFER_MS > now) {
    return cachedAccessToken
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials'
    })
  })

  const tokenText = await tokenResponse.text()
  if (!tokenResponse.ok) {
    console.error('Spotify token error', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      body: tokenText
    })
    throw new Error('Failed to fetch Spotify access token.')
  }

  let tokenData: any
  try {
    tokenData = tokenText ? JSON.parse(tokenText) : null
  } catch {
    throw new Error('Invalid Spotify token response.')
  }

  const accessToken = tokenData?.access_token as string | undefined
  const expiresIn = Number(tokenData?.expires_in ?? 0)

  if (!accessToken || !expiresIn) {
    throw new Error('Invalid Spotify token payload.')
  }

  cachedAccessToken = accessToken
  cachedExpiresAt = now + expiresIn * 1000

  return accessToken
}

export async function spotifyApiFetch(url: string | URL, init?: RequestInit) {
  const accessToken = await getAppAccessToken()

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  })

  const text = await response.text()
  const payload = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return text
        }
      })()
    : null

  if (!response.ok) {
    console.error('Spotify API error', {
      status: response.status,
      statusText: response.statusText,
      body: payload
    })
    throw new Error(
      `Spotify API request failed: ${response.status} ${response.statusText}${
        payload?.error?.message ? ` - ${payload.error.message}` : ''
      }`
    )
  }

  return payload
}

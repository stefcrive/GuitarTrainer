import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getCookieOptions,
  getOAuthConfig,
  YT_ACCESS_TOKEN_COOKIE,
  YT_EXPIRES_AT_COOKIE,
  YT_REFRESH_TOKEN_COOKIE
} from '@/lib/youtube-oauth'

export const runtime = 'nodejs'

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  const text = await response.text()
  if (!response.ok) {
    return null
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  if (!data.access_token || !data.expires_in) {
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
  response.cookies.set(YT_ACCESS_TOKEN_COOKIE, refreshed.accessToken, getCookieOptions(refreshed.expiresIn))
  response.cookies.set(YT_EXPIRES_AT_COOKIE, `${refreshed.expiresAt}`, getCookieOptions(refreshed.expiresIn))
}

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, configured } = getOAuthConfig()

  if (!configured || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'YouTube OAuth is not configured.' }, { status: 500 })
  }

  const playlistId = request.nextUrl.searchParams.get('playlistId')
  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId.' }, { status: 400 })
  }

  const includeItems = request.nextUrl.searchParams.get('includeItems') !== 'false'

  const cookieStore = cookies()
  const accessTokenCookie = cookieStore.get(YT_ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = cookieStore.get(YT_REFRESH_TOKEN_COOKIE)?.value
  const expiresAt = Number(cookieStore.get(YT_EXPIRES_AT_COOKIE)?.value)

  const tokenExpired = !accessTokenCookie || !expiresAt || Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
  let accessToken = accessTokenCookie
  let refreshedTokens: { accessToken: string; expiresIn: number; expiresAt: number } | null = null

  if (tokenExpired) {
    if (!refreshToken) {
      return NextResponse.json({ error: 'YouTube account not connected.' }, { status: 401 })
    }

    const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
    if (!refreshed) {
      return NextResponse.json({ error: 'Failed to refresh access token.' }, { status: 401 })
    }

    accessToken = refreshed.accessToken
    refreshedTokens = refreshed
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'YouTube account not connected.' }, { status: 401 })
  }

  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/playlists')
  detailsUrl.searchParams.set('part', 'snippet')
  detailsUrl.searchParams.set('id', playlistId)

  const detailsResponse = await fetch(detailsUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const detailsText = await detailsResponse.text()
  if (!detailsResponse.ok) {
    const response = NextResponse.json(
      { error: 'YouTube API error.', details: detailsText },
      { status: detailsResponse.status }
    )
    if (refreshedTokens) {
      applyRefreshedCookies(response, refreshedTokens)
    }
    return response
  }

  const detailsData = detailsText ? JSON.parse(detailsText) : null
  if (!detailsData?.items?.[0]) {
    const response = NextResponse.json(
      { error: 'Playlist not found or not accessible.' },
      { status: 404 }
    )
    if (refreshedTokens) {
      applyRefreshedCookies(response, refreshedTokens)
    }
    return response
  }

  let videos: Array<{ id: string; title: string; description?: string; thumbnailUrl: string }> = []

  if (includeItems) {
    const itemsUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    itemsUrl.searchParams.set('part', 'snippet')
    itemsUrl.searchParams.set('maxResults', '50')
    itemsUrl.searchParams.set('playlistId', playlistId)

    const itemsResponse = await fetch(itemsUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    const itemsText = await itemsResponse.text()
    if (!itemsResponse.ok) {
      const response = NextResponse.json(
        { error: 'YouTube API error.', details: itemsText },
        { status: itemsResponse.status }
      )
      if (refreshedTokens) {
        applyRefreshedCookies(response, refreshedTokens)
      }
      return response
    }

    const itemsData = itemsText ? JSON.parse(itemsText) : null
    videos = (itemsData?.items || [])
      .map((item: any) => {
        const videoId = item?.snippet?.resourceId?.videoId
        if (!videoId) return null

        return {
          id: videoId,
          title: item.snippet?.title || 'Untitled',
          description: item.snippet?.description,
          thumbnailUrl: item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            ''
        }
      })
      .filter(Boolean)
  }

  const payload = {
    id: playlistId,
    title: detailsData.items[0].snippet?.title || 'Untitled',
    description: detailsData.items[0].snippet?.description,
    videos
  }

  const response = NextResponse.json(payload)
  if (refreshedTokens) {
    applyRefreshedCookies(response, refreshedTokens)
  }
  return response
}

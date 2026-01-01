import { NextRequest, NextResponse } from 'next/server'
import { getAppAccessToken, getSpotifyConfig } from '@/lib/spotify-api'

export const runtime = 'nodejs'

function mapTrack(item: any) {
  return {
    id: item?.id || '',
    uri: item?.uri || '',
    name: item?.name || 'Untitled',
    artists: Array.isArray(item?.artists) ? item.artists.map((artist: any) => artist?.name).filter(Boolean) : [],
    album: item?.album?.name || '',
    image: item?.album?.images?.[1]?.url || item?.album?.images?.[0]?.url || '',
    previewUrl: item?.preview_url || null,
    externalUrl: item?.external_urls?.spotify || '',
    durationMs: item?.duration_ms || 0
  }
}

function mapPlaylist(item: any) {
  return {
    id: item?.id || '',
    name: item?.name || 'Untitled playlist',
    description: item?.description || '',
    owner: item?.owner?.display_name || '',
    image: item?.images?.[0]?.url || '',
    externalUrl: item?.external_urls?.spotify || '',
    trackCount: item?.tracks?.total || 0
  }
}

export async function GET(request: NextRequest) {
  const { configured } = getSpotifyConfig()
  if (!configured) {
    return NextResponse.json({ error: 'Spotify is not configured.' }, { status: 500 })
  }

  const query = request.nextUrl.searchParams.get('q')
  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'Missing query parameter "q".' }, { status: 400 })
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 12)
  const limit = Math.min(Math.max(limitParam, 1), 30)
  const typeParam = request.nextUrl.searchParams.get('type')
  const allowedTypes = ['track', 'playlist']
  const types = (typeParam?.split(',') || [])
    .map((value) => value.trim())
    .filter((value) => allowedTypes.includes(value))
  const searchTypes = types.length > 0 ? types : ['track', 'playlist']

  try {
    const accessToken = await getAppAccessToken()
    const url = new URL('https://api.spotify.com/v1/search')
    url.searchParams.set('q', query)
    url.searchParams.set('type', searchTypes.join(','))
    url.searchParams.set('limit', `${limit}`)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    const text = await response.text()

    if (!response.ok) {
      console.error('Spotify search error', {
        status: response.status,
        statusText: response.statusText,
        body: text
      })
      return NextResponse.json(
        { error: 'Spotify API error.', details: text || response.statusText },
        { status: response.status }
      )
    }

    const data = text ? JSON.parse(text) : {}
    const tracks = Array.isArray(data?.tracks?.items) ? data.tracks.items.map(mapTrack) : []
    const playlists = Array.isArray(data?.playlists?.items) ? data.playlists.items.map(mapPlaylist) : []

    return NextResponse.json({ tracks, playlists })
  } catch (error) {
    console.error('Spotify search failed', error)
    return NextResponse.json({ error: 'Failed to search Spotify.' }, { status: 500 })
  }
}

interface YouTubeVideo {
  id: string
  title: string
  description?: string
  thumbnailUrl: string
}

interface YouTubePlaylistData {
  id: string
  title: string
  description?: string
  videos: YouTubeVideo[]
}

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY
const AUTH_STATUS_TTL_MS = 60 * 1000
let cachedAuthStatus: YouTubeAuthStatus | null = null
let lastAuthStatusCheck = 0

export interface YouTubeAuthStatus {
  configured: boolean
  authorized: boolean
}

function extractPlaylistId(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Invalid playlist ID format. Please use a full YouTube playlist URL or a playlist ID.')
  }

  // Handle full URLs
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    try {
      const url = new URL(trimmed)
      const listParam = url.searchParams.get('list')
      if (listParam) return listParam
    } catch {
      // Fall through to raw ID handling
    }
  }
  
  // Handle raw playlist IDs (various prefixes like PL, UU, RD, OLAK5uy)
  const normalized = trimmed.replace(/\s+/g, '')
  if (/^[A-Za-z0-9_-]{10,}$/.test(normalized)) {
    return normalized
  }

  throw new Error('Invalid playlist ID format. Please use a full YouTube playlist URL or a playlist ID.')
}

async function fetchWithErrorHandling(url: string, options?: RequestInit) {
  const redactedUrl = YOUTUBE_API_KEY ? url.replace(YOUTUBE_API_KEY, '[API_KEY]') : url
  const shouldLogKey = Boolean(YOUTUBE_API_KEY && url.includes(YOUTUBE_API_KEY))
  console.log('Fetching URL:', redactedUrl)
  if (shouldLogKey) {
    console.log('API Key available:', !!YOUTUBE_API_KEY)
  }

  try {
    const response = await fetch(url, options)
    const responseText = await response.text()
    const responseData = responseText
      ? (() => {
          try {
            return JSON.parse(responseText)
          } catch {
            return responseText
          }
        })()
      : null
    
    if (!response.ok) {
      const errorMessage =
        typeof responseData === 'string'
          ? responseData
          : responseData?.error?.message ||
            responseData?.error ||
            responseData?.details ||
            responseData?.message ||
            ''

      console.error('YouTube API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      })
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}${errorMessage ? ` - ${errorMessage}` : ''}`
      )
    }

    return responseData
  } catch (error) {
    console.error('Fetch error:', error)
    throw error
  }
}

async function fetchPlaylistItemsWithApiKey(playlistId: string): Promise<YouTubeVideo[]> {
  if (!YOUTUBE_API_KEY) {
    console.error('YouTube API key is not configured')
    throw new Error('YouTube API key not configured')
  }

  try {
    const data = await fetchWithErrorHandling(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`
    )
    
    if (!data.items?.length) {
      console.warn('No playlist items found')
      return []
    }

    return data.items.map((item: any) => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
    }))
  } catch (error) {
    console.error('Error fetching playlist items:', error)
    throw error
  }
}

async function fetchPlaylistDetailsWithApiKey(playlistId: string) {
  if (!YOUTUBE_API_KEY) {
    console.error('YouTube API key is not configured')
    throw new Error('YouTube API key not configured')
  }

  try {
    const data = await fetchWithErrorHandling(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`
    )
    
    if (!data.items?.[0]) {
      console.error('Playlist not found or not accessible:', playlistId)
      throw new Error(
        'Playlist not found or not accessible. This could be because:\n' +
        '1. The playlist is private\n' +
        '2. The playlist is unlisted\n' +
        '3. The playlist ID is incorrect\n' +
        'Please check that the playlist is public and the ID is correct.'
      )
    }

    return {
      id: playlistId,
      title: data.items[0].snippet.title,
      description: data.items[0].snippet.description
    }
  } catch (error) {
    console.error('Error fetching playlist details:', error)
    throw error
  }
}

async function fetchPlaylistDetailsWithOAuth(playlistId: string) {
  const data = await fetchWithErrorHandling(
    `/api/youtube/playlist?playlistId=${encodeURIComponent(playlistId)}&includeItems=false`
  )

  if (!data?.id) {
    console.error('Playlist not found or not accessible:', playlistId)
    throw new Error(
      'Playlist not found or not accessible. This could be because:\n' +
      '1. The playlist is private\n' +
      '2. The playlist is unlisted\n' +
      '3. The playlist ID is incorrect\n' +
      'Please check that the playlist is public and the ID is correct.'
    )
  }

  return {
    id: playlistId,
    title: data.title,
    description: data.description
  }
}

async function fetchPlaylistDataWithOAuth(playlistId: string): Promise<YouTubePlaylistData> {
  const data = await fetchWithErrorHandling(
    `/api/youtube/playlist?playlistId=${encodeURIComponent(playlistId)}`
  )

  if (!data?.id) {
    console.error('Playlist not found or not accessible:', playlistId)
    throw new Error(
      'Playlist not found or not accessible. This could be because:\n' +
      '1. The playlist is private\n' +
      '2. The playlist is unlisted\n' +
      '3. The playlist ID is incorrect\n' +
      'Please check that the playlist is public and the ID is correct.'
    )
  }

  return {
    id: playlistId,
    title: data.title,
    description: data.description,
    videos: Array.isArray(data.videos) ? data.videos : []
  }
}

async function fetchYouTubeAuthStatus(force = false): Promise<YouTubeAuthStatus> {
  const now = Date.now()
  if (!force && cachedAuthStatus && now - lastAuthStatusCheck < AUTH_STATUS_TTL_MS) {
    return cachedAuthStatus
  }

  const response = await fetch('/api/youtube/status')
  if (!response.ok) {
    throw new Error('Failed to check YouTube authorization status.')
  }

  const data = await response.json()
  cachedAuthStatus = {
    configured: Boolean(data?.configured),
    authorized: Boolean(data?.authorized)
  }
  lastAuthStatusCheck = now
  return cachedAuthStatus
}

export async function getYouTubeAuthStatus(force = false): Promise<YouTubeAuthStatus> {
  return fetchYouTubeAuthStatus(force)
}

export async function disconnectYouTubeAccount(): Promise<void> {
  const response = await fetch('/api/youtube/logout', { method: 'POST' })
  if (!response.ok) {
    throw new Error('Failed to disconnect YouTube account.')
  }
  cachedAuthStatus = cachedAuthStatus
    ? { ...cachedAuthStatus, authorized: false }
    : { configured: false, authorized: false }
  lastAuthStatusCheck = Date.now()
}

export async function fetchPlaylistData(playlistId: string): Promise<YouTubePlaylistData> {
  try {
    const normalizedId = extractPlaylistId(playlistId)
    let authStatus: YouTubeAuthStatus | null = null
    try {
      authStatus = await fetchYouTubeAuthStatus()
    } catch (error) {
      console.warn('Failed to check YouTube OAuth status:', error)
    }

    if (authStatus?.authorized) {
      try {
        return await fetchPlaylistDataWithOAuth(normalizedId)
      } catch (error) {
        if (!YOUTUBE_API_KEY) {
          throw error
        }
        console.warn('OAuth playlist fetch failed, falling back to API key:', error)
      }
    } else if (!YOUTUBE_API_KEY && authStatus?.configured) {
      throw new Error('YouTube account not connected. Connect your YouTube account in Settings.')
    }

    if (!YOUTUBE_API_KEY) {
      throw new Error('YouTube API key not configured')
    }

    const [details, videos] = await Promise.all([
      fetchPlaylistDetailsWithApiKey(normalizedId),
      fetchPlaylistItemsWithApiKey(normalizedId)
    ])

    return {
      ...details,
      videos
    }
  } catch (error) {
    console.error('Error fetching playlist data:', error)
    throw error
  }
}

export async function validatePlaylistId(playlistId: string): Promise<boolean> {
  if (!playlistId || !playlistId.trim()) {
    return false
  }

  try {
    const normalizedId = extractPlaylistId(playlistId)
    let authStatus: YouTubeAuthStatus | null = null
    try {
      authStatus = await fetchYouTubeAuthStatus()
    } catch (error) {
      console.warn('Failed to check YouTube OAuth status:', error)
    }

    if (authStatus?.authorized) {
      await fetchPlaylistDetailsWithOAuth(normalizedId)
      return true
    }

    if (!YOUTUBE_API_KEY && authStatus?.configured) {
      return false
    }

    await fetchPlaylistDetailsWithApiKey(normalizedId)
    return true
  } catch (error) {
    console.error('Error validating playlist ID:', error)
    return false
  }
}

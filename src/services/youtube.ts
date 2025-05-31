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

function extractPlaylistId(input: string): string {
  // Handle full URLs
  if (input.includes('youtube.com') || input.includes('youtu.be')) {
    const url = new URL(input)
    const listParam = url.searchParams.get('list')
    if (listParam) return listParam
  }
  
  // Handle raw playlist IDs (starting with PL)
  if (input.startsWith('PL')) {
    return input
  }

  throw new Error('Invalid playlist ID format. Please use a full YouTube playlist URL or a playlist ID starting with PL')
}

async function fetchWithErrorHandling(url: string) {
  console.log('Fetching URL:', url.replace(YOUTUBE_API_KEY || '', '[API_KEY]'))
  console.log('API Key available:', !!YOUTUBE_API_KEY)

  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('YouTube API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Fetch error:', error)
    throw error
  }
}

async function fetchPlaylistItems(playlistId: string): Promise<YouTubeVideo[]> {
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

async function fetchPlaylistDetails(playlistId: string) {
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

export async function fetchPlaylistData(playlistId: string): Promise<YouTubePlaylistData> {
  try {
    const normalizedId = extractPlaylistId(playlistId)
    const [details, videos] = await Promise.all([
      fetchPlaylistDetails(normalizedId),
      fetchPlaylistItems(normalizedId)
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
    await fetchPlaylistDetails(normalizedId)
    return true
  } catch (error) {
    console.error('Error validating playlist ID:', error)
    return false
  }
}
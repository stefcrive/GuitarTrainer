import type { SpotifyAuthStatus, SpotifyPlaylist, SpotifySearchResult, SpotifyTrack } from '@/types/spotify'

const STATUS_TTL_MS = 60 * 1000

let cachedStatus: SpotifyAuthStatus | null = null
let lastStatusCheck = 0

export async function getSpotifyStatus(force = false): Promise<SpotifyAuthStatus> {
  const now = Date.now()
  if (!force && cachedStatus && now - lastStatusCheck < STATUS_TTL_MS) {
    return cachedStatus
  }

  const response = await fetch('/api/spotify/status')
  const text = await response.text()

  if (!response.ok) {
    throw new Error('Failed to check Spotify configuration.')
  }

  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  cachedStatus = {
    configured: Boolean(data?.configured),
    authorized: Boolean(data?.authorized)
  }
  lastStatusCheck = now
  return cachedStatus
}

export interface SpotifySearchOptions {
  type?: 'track' | 'playlist' | 'both'
  limit?: number
}

export async function fetchPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const response = await fetch(
      `/api/spotify/playlist/tracks?playlistId=${encodeURIComponent(playlistId)}&offset=${offset}&limit=${limit}`
    )
    const text = await response.text()

    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error('Invalid response from Spotify playlist tracks.')
    }

    if (!response.ok) {
      const details =
        typeof data === 'string'
          ? data
          : data?.error || data?.details || response.statusText
      throw new Error(`Failed to load playlist tracks: ${details}`)
    }

    const pageTracks = Array.isArray(data?.tracks) ? data.tracks : []
    tracks.push(...pageTracks)

    const hasMore = Boolean(data?.hasMore) && pageTracks.length > 0
    if (!hasMore) {
      break
    }
    offset = typeof data?.nextOffset === 'number' ? data.nextOffset : offset + limit
  }

  return tracks
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  isActive: boolean
  volumePercent: number | null
}

export interface SpotifyPlaybackState {
  isPlaying: boolean
  progressMs: number
  durationMs: number
  trackUri: string | null
  trackName: string | null
  artists: string[]
  deviceId: string | null
}

export async function searchSpotify(query: string, options?: SpotifySearchOptions): Promise<SpotifySearchResult> {
  if (!query.trim()) {
    throw new Error('Please enter a search term.')
  }

  const params = new URLSearchParams({
    q: query.trim()
  })

  if (options?.type) {
    params.set('type', options.type === 'both' ? 'track,playlist' : options.type)
  }

  if (options?.limit) {
    params.set('limit', String(options.limit))
  }

  const response = await fetch(`/api/spotify/search?${params.toString()}`)
  const text = await response.text()

  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Invalid response from Spotify search.')
  }

  if (!response.ok) {
    const details =
      typeof data === 'string'
        ? data
        : data?.error || data?.details || response.statusText
    throw new Error(`Spotify search failed: ${details}`)
  }

  return {
    tracks: Array.isArray(data?.tracks) ? data.tracks : [],
    playlists: Array.isArray(data?.playlists) ? data.playlists : []
  }
}

export async function fetchUserPlaylists(): Promise<SpotifyPlaylist[]> {
  const response = await fetch('/api/spotify/playlists')
  const text = await response.text()

  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Invalid response from Spotify playlists.')
  }

  if (!response.ok) {
    const details =
      typeof data === 'string'
        ? data
        : data?.error || data?.details || response.statusText
    throw new Error(`Failed to load playlists: ${details}`)
  }

  return Array.isArray(data?.playlists) ? data.playlists : []
}

export async function fetchDevices(): Promise<SpotifyDevice[]> {
  const response = await fetch('/api/spotify/player/devices')
  const text = await response.text()

  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Invalid response from Spotify devices.')
  }

  if (!response.ok) {
    const details =
      typeof data === 'string'
        ? data
        : data?.error || data?.details || response.statusText
    throw new Error(`Failed to load devices: ${details}`)
  }

  return Array.isArray(data?.devices) ? data.devices : []
}

export async function fetchPlaybackState(): Promise<SpotifyPlaybackState | null> {
  const response = await fetch('/api/spotify/player/state')
  const text = await response.text()

  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Invalid response from Spotify state.')
  }

  if (!response.ok) {
    const details =
      typeof data === 'string'
        ? data
        : data?.error || data?.details || response.statusText
    throw new Error(`Failed to load playback state: ${details}`)
  }

  return data?.state ?? null
}

export async function playSpotifyTrack(trackUri: string, deviceId?: string, positionMs?: number) {
  const response = await fetch('/api/spotify/player/play', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trackUri,
      deviceId,
      positionMs
    })
  })

  const text = await response.text()
  if (!response.ok) {
    let details: string | undefined
    try {
      const parsed = text ? JSON.parse(text) : null
      details =
        typeof parsed === 'string'
          ? parsed
          : parsed?.error || parsed?.details || response.statusText
    } catch {
      details = text || response.statusText
    }
    throw new Error(`Failed to start playback: ${details}`)
  }
}

export async function pauseSpotify(deviceId?: string) {
  const response = await fetch('/api/spotify/player/pause', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ deviceId })
  })

  const text = await response.text()
  if (!response.ok) {
    let details: string | undefined
    try {
      const parsed = text ? JSON.parse(text) : null
      details =
        typeof parsed === 'string'
          ? parsed
          : parsed?.error || parsed?.details || response.statusText
    } catch {
      details = text || response.statusText
    }
    throw new Error(`Failed to pause playback: ${details}`)
  }
}

export async function seekSpotify(positionMs: number, deviceId?: string) {
  const response = await fetch('/api/spotify/player/seek', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ positionMs, deviceId })
  })

  const text = await response.text()
  if (!response.ok) {
    let details: string | undefined
    try {
      const parsed = text ? JSON.parse(text) : null
      details =
        typeof parsed === 'string'
          ? parsed
          : parsed?.error || parsed?.details || response.statusText
    } catch {
      details = text || response.statusText
    }
    throw new Error(`Failed to seek playback: ${details}`)
  }
}

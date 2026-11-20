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
          : data?.details || data?.error || response.statusText
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
        : data?.details || data?.error || response.statusText
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
        : data?.details || data?.error || response.statusText
    throw new Error(`Failed to load playlists: ${details}`)
  }

  return Array.isArray(data?.playlists) ? data.playlists : []
}

export async function fetchDevices(): Promise<SpotifyDevice[]> {
  const response = await fetch('/api/spotify/player/devices', { cache: 'no-store' })
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
        : data?.details || data?.error || response.statusText
    throw new Error(`Failed to load devices: ${details}`)
  }

  return Array.isArray(data?.devices) ? data.devices : []
}

export async function fetchPlaybackState(): Promise<SpotifyPlaybackState | null> {
  const response = await fetch('/api/spotify/player/state', { cache: 'no-store' })
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
        : data?.details || data?.error || response.statusText
    throw new Error(`Failed to load playback state: ${details}`)
  }

  return data?.state ?? null
}

function playbackError(details: unknown, status: number): string {
  let message = typeof details === 'string' ? details : 'Spotify rejected the command.'
  try {
    const parsed = JSON.parse(message)
    message = parsed?.error?.message || parsed?.message || message
  } catch { /* Spotify may return a plain-text message. */ }
  if (status === 401) return 'Reconnect Spotify and try again.'
  if (status === 404) return 'Open Spotify on the target device, start a track there, then refresh devices and retry.'
  if (status === 403) {
    return `${message} (403). Check that the target device uses your connected Spotify Premium account. Try playing the selected track in Spotify, then retry here.`
  }
  return `${message} (${status})`
}

export async function playSpotifyTrack(trackUri: string, deviceId?: string, positionMs?: number) {
  // Resume the current track without replacing its queue/context.
  const state = await fetchPlaybackState().catch(() => null)
  const resume = state?.trackUri === trackUri && (!deviceId || state.deviceId === deviceId)
  const response = await fetch('/api/spotify/player/play', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trackUri,
      resume,
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
          : parsed?.details || parsed?.error || response.statusText
    } catch {
      details = text || response.statusText
    }
    throw new Error(`Failed to start playback: ${playbackError(details, response.status)}`)
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
    // Spotify can reject a repeated pause. Verify the target is already paused.
    if (response.status === 403) {
      const state = await fetchPlaybackState().catch(() => null)
      if (state && !state.isPlaying && (!deviceId || state.deviceId === deviceId)) return
    }
    let details: string | undefined
    try {
      const parsed = text ? JSON.parse(text) : null
      details =
        typeof parsed === 'string'
          ? parsed
          : parsed?.details || parsed?.error || response.statusText
    } catch {
      details = text || response.statusText
    }
    throw new Error(`Failed to pause playback: ${playbackError(details, response.status)}`)
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
          : parsed?.details || parsed?.error || response.statusText
    } catch {
      details = text || response.statusText
    }
    throw new Error(`Failed to seek playback: ${playbackError(details, response.status)}`)
  }
}

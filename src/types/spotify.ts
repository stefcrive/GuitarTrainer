export interface SpotifyTrack {
  id: string
  uri?: string
  name: string
  artists: string[]
  album: string
  image: string
  previewUrl: string | null
  externalUrl: string
  durationMs: number
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description?: string
  owner?: string
  image: string
  externalUrl: string
  trackCount: number
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[]
  playlists: SpotifyPlaylist[]
}

export interface SpotifyAuthStatus {
  configured: boolean
  authorized: boolean
}

'use client'

import type { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify'
import { ExternalLink, Headphones, ListMusic, Play } from 'lucide-react'

interface SpotifyResultListProps {
  tracks: SpotifyTrack[]
  playlists: SpotifyPlaylist[]
  selectedTrackId?: string | null
  selectedPlaylistId?: string | null
  onSelectTrack: (track: SpotifyTrack) => void
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void
}

const formatDuration = (ms: number) => {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function SpotifyResultList({
  tracks,
  playlists,
  selectedTrackId,
  selectedPlaylistId,
  onSelectTrack,
  onSelectPlaylist
}: SpotifyResultListProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4" />
            <span>{tracks.length} Tracks</span>
          </div>
        </div>

        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracks yet. Try a search above.</p>
        ) : (
          <div className="space-y-2">
            {tracks.map((track) => {
              const isSelected = selectedTrackId === track.id
              return (
                <button
                  key={track.id}
                  onClick={() => onSelectTrack(track)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    {track.image ? (
                      <img
                        src={track.image}
                        alt={track.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Play className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium truncate">{track.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {track.artists.join(', ')} {track.album ? `• ${track.album}` : ''}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {track.previewUrl ? 'Preview available' : 'No preview'} • {formatDuration(track.durationMs)}
                    </div>
                  </div>
                  {track.externalUrl && (
                    <a
                      href={track.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground"
                      title="Open in Spotify"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ListMusic className="h-4 w-4" />
          <span>{playlists.length} Playlists</span>
        </div>

        {playlists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No playlists in this search.</p>
        ) : (
          <div className="space-y-2">
            {playlists.map((playlist) => {
              const isSelected = selectedPlaylistId === playlist.id
              return (
                <button
                  key={playlist.id}
                  onClick={() => onSelectPlaylist(playlist)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    {playlist.image ? (
                      <img
                        src={playlist.image}
                        alt={playlist.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <ListMusic className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium truncate">{playlist.name}</div>
                    {playlist.owner && (
                      <div className="text-xs text-muted-foreground truncate">by {playlist.owner}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {playlist.trackCount} tracks
                    </div>
                  </div>
                  {playlist.externalUrl && (
                    <a
                      href={playlist.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground"
                      title="Open in Spotify"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

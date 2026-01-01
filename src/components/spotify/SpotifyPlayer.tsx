'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify'
import { ExternalLink, Headphones, ListMusic } from 'lucide-react'

interface SpotifyPlayerProps {
  track?: SpotifyTrack | null
  playlist?: SpotifyPlaylist | null
}

const formatDuration = (ms: number) => {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function SpotifyPlayer({ track, playlist }: SpotifyPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (track?.previewUrl) {
      audio.src = track.previewUrl
      audio
        .play()
        .catch((error) => {
          console.warn('Auto-play blocked', error)
        })
    } else {
      audio.pause()
      audio.removeAttribute('src')
    }
  }, [track?.id, track?.previewUrl])

  if (!track && !playlist) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Search for a track or playlist to get started
      </div>
    )
  }

  if (track) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-44 rounded-lg overflow-hidden bg-muted">
            {track.image ? (
              <img src={track.image} alt={track.name} className="w-full" />
            ) : (
              <div className="aspect-square flex items-center justify-center text-muted-foreground">
                <Headphones className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground uppercase tracking-wide">Track</div>
            <h2 className="text-2xl font-semibold leading-tight">{track.name}</h2>
            <p className="text-muted-foreground">{track.artists.join(', ')}</p>
            {track.album && <p className="text-sm text-muted-foreground">Album: {track.album}</p>}
            <p className="text-sm text-muted-foreground">
              Duration: {formatDuration(track.durationMs)}
            </p>

            <div className="flex gap-2">
              {track.externalUrl && (
                <Button asChild variant="default" size="sm" className="gap-2">
                  <a href={track.externalUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open in Spotify
                  </a>
                </Button>
              )}
              {track.previewUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const audio = audioRef.current
                    if (!audio) return
                    if (audio.paused) {
                      audio.play()
                    } else {
                      audio.pause()
                    }
                  }}
                >
                  Play preview
                </Button>
              )}
            </div>
          </div>
        </div>

        {track.previewUrl ? (
          <div className="rounded-lg border bg-card p-4">
            <audio ref={audioRef} controls className="w-full" />
            <p className="text-xs text-muted-foreground mt-2">
              30s preview provided by Spotify. Full playback opens in Spotify.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              This track does not provide a preview. Open it in Spotify to listen.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-44 rounded-lg overflow-hidden bg-muted">
          {playlist?.image ? (
            <img src={playlist.image} alt={playlist.name} className="w-full" />
          ) : (
            <div className="aspect-square flex items-center justify-center text-muted-foreground">
              <ListMusic className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground uppercase tracking-wide">Playlist</div>
          <h2 className="text-2xl font-semibold leading-tight">{playlist?.name}</h2>
          {playlist?.owner && (
            <p className="text-muted-foreground text-sm">by {playlist.owner}</p>
          )}
          {playlist?.description && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {playlist.description}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{playlist?.trackCount} tracks</p>

          {playlist?.externalUrl && (
            <Button asChild variant="default" size="sm" className="gap-2">
              <a href={playlist.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open in Spotify
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import {
  fetchDevices,
  fetchPlaybackState,
  fetchPlaylistTracks,
  fetchUserPlaylists,
  getSpotifyStatus,
  pauseSpotify,
  playSpotifyTrack,
  searchSpotify,
  seekSpotify
} from '@/services/spotify'
import { useMediaStore } from '@/stores/media-store'
import type { SpotifyPlaylist, SpotifyTrack } from '@/types/spotify'
import { AlertCircle, ListMusic, Music2, Pause, Play, RefreshCw } from 'lucide-react'
import { AudioMarkers } from '@/components/audio/AudioMarkers'
import type { AudioAnnotation, AudioMarker } from '@/types/audio'
import { Input } from '@/components/ui/input'

export default function SpotifyPage() {
  const [statusChecked, setStatusChecked] = useState(false)
  const [isConfigured, setIsConfigured] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([])
  const [playlistTracksLoading, setPlaylistTracksLoading] = useState(false)
  const [playlistTracksError, setPlaylistTracksError] = useState<string | null>(null)
  const [devices, setDevices] = useState<{ id: string; name: string; type: string; isActive: boolean }[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [playbackState, setPlaybackState] = useState<{
    isPlaying: boolean
    progressMs: number
    durationMs: number
    trackUri: string | null
    trackName?: string | null
    artists?: string[]
  } | null>(null)
  const [stateError, setStateError] = useState<string | null>(null)
  const [markerState, setMarkerState] = useState<{ markers: AudioMarker[]; annotations: AudioAnnotation[] }>({
    markers: [],
    annotations: []
  })

  const {
    spotify: { selectedTrack, selectedPlaylist },
    setSelectedSpotifyTrack,
    setSelectedSpotifyPlaylist
  } = useMediaStore()

  const storageKey = useMemo(
    () => (selectedTrack?.uri ? `spotify-markers:${selectedTrack.uri}` : null),
    [selectedTrack?.uri]
  )

  useEffect(() => {
    getSpotifyStatus()
      .then((status) => {
        setIsConfigured(status.configured)
        setIsAuthorized(status.authorized)
        if (!status.authorized) {
          setPlaylists([])
        }
        setStatusChecked(true)
      })
      .catch(() => {
        setIsConfigured(false)
        setIsAuthorized(false)
        setPlaylists([])
        setStatusChecked(true)
      })
  }, [])

  const loadUserPlaylists = async () => {
    if (!isAuthorized) return
    setPlaylistLoading(true)
    setPlaylistError(null)
    try {
      const data = await fetchUserPlaylists()
      setPlaylists(data)
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : 'Failed to load playlists.')
    } finally {
      setPlaylistLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      loadUserPlaylists()
    }
  }, [isAuthorized])

  // Load markers for selected track from localStorage
  useEffect(() => {
    if (!storageKey) {
      setMarkerState({ markers: [], annotations: [] })
      return
    }
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        setMarkerState({
          markers: Array.isArray(parsed?.markers) ? parsed.markers : [],
          annotations: Array.isArray(parsed?.annotations) ? parsed.annotations : []
        })
      } else {
        setMarkerState({ markers: [], annotations: [] })
      }
    } catch {
      setMarkerState({ markers: [], annotations: [] })
    }
  }, [storageKey])

  const persistMarkerState = (next: { markers: AudioMarker[]; annotations: AudioAnnotation[] }) => {
    setMarkerState(next)
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(next))
    }
  }

  useEffect(() => {
    const loadTracks = async () => {
      if (!selectedPlaylist?.id || !isAuthorized) {
        setPlaylistTracks([])
        return
      }
      setPlaylistTracksLoading(true)
      setPlaylistTracksError(null)
      try {
        const tracks = await fetchPlaylistTracks(selectedPlaylist.id)
        setPlaylistTracks(tracks)
        if (tracks.length > 0) {
          setSelectedSpotifyTrack(tracks[0])
        }
      } catch (err) {
        setPlaylistTracksError(err instanceof Error ? err.message : 'Failed to load playlist tracks.')
        setPlaylistTracks([])
      } finally {
        setPlaylistTracksLoading(false)
      }
    }

    loadTracks()
  }, [selectedPlaylist?.id, isAuthorized, setSelectedSpotifyTrack])

  const loadDevices = async () => {
    if (!isAuthorized) return
    try {
      const data = await fetchDevices()
      setDevices(data)
      const active = data.find((d) => d.isActive)
      if (active) {
        setSelectedDeviceId(active.id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const loadPlaybackState = async () => {
    if (!isAuthorized) return
    try {
      const state = await fetchPlaybackState()
      setPlaybackState(state ? { ...state } : null)
      if (state?.deviceId) {
        setSelectedDeviceId((prev) => prev || state.deviceId)
      }
      setStateError(null)
    } catch (err) {
      setStateError(err instanceof Error ? err.message : 'Failed to load playback state.')
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      loadDevices()
      loadPlaybackState()
    }
  }, [isAuthorized])
  useEffect(() => {
    if (!isAuthorized) return
    const interval = setInterval(async () => {
      try {
        const state = await fetchPlaybackState()
        setPlaybackState(state ? { ...state } : null)

        // Loop handling: if a marker is set to loop and progress past end, seek back
        if (state && markerState.markers.some((m) => m.isLooping)) {
          const loopingMarker = markerState.markers.find((m) => m.isLooping)
          if (loopingMarker && state.progressMs / 1000 >= loopingMarker.endTime) {
            await seekSpotify(loopingMarker.startTime * 1000, selectedDeviceId ?? undefined)
          }
        }
      } catch (err) {
        setStateError(err instanceof Error ? err.message : 'Failed to load playback state.')
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [isAuthorized, markerState.markers, selectedDeviceId])

  const handleSelectTrack = async (track?: SpotifyTrack, autoPlay = false) => {
    if (!track?.uri) return
    setSelectedSpotifyTrack(track)
    if (autoPlay) {
      try {
        await playSpotifyTrack(track.uri, selectedDeviceId ?? undefined)
        await loadPlaybackState()
      } catch (err) {
        setStateError(err instanceof Error ? err.message : 'Failed to start playback.')
      }
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={32} minSize={20} maxSize={50}>
            <div className="h-full border-r bg-muted/30 flex flex-col">
              <div className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="flex items-center gap-2">
                  <Music2 className="h-5 w-5 text-green-600" />
                  <h2 className="text-xl font-semibold">Spotify</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Browse your playlists and tracks, then control playback on your Spotify device.
                </p>

                {!isConfigured && statusChecked && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-medium">Spotify is not configured.</p>
                        <p>Add your client ID/secret to .env.local and restart.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border bg-white/60 dark:bg-gray-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ListMusic className="h-4 w-4 text-green-600" />
                      Your Playlists
                    </div>
                    {isAuthorized ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={loadUserPlaylists}
                          disabled={playlistLoading}
                          className="gap-2"
                        >
                          <RefreshCw className={`h-4 w-4 ${playlistLoading ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSpotifyPlaylist(null)
                            setSelectedSpotifyTrack(null)
                            setPlaylistTracks([])
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <Button asChild size="sm" variant="default">
                        <a href="/api/spotify/auth?redirect=/spotify">Connect Spotify</a>
                      </Button>
                    )}
                  </div>

                  {playlistError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      {playlistError}
                    </div>
                  )}

                  {!isAuthorized && (
                    <p className="text-xs text-muted-foreground">
                      Connect your Spotify account to see your playlists here.
                    </p>
                  )}

                  {isAuthorized && (
                    <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                      {playlistLoading && playlists.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Loading playlists...</div>
                      ) : playlists.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No playlists found.</div>
                      ) : (
                        playlists.map((pl) => {
                          const isSelected = selectedPlaylist?.id === pl.id
                          return (
                            <button
                              key={pl.id}
                              onClick={() => setSelectedSpotifyPlaylist(pl)}
                              className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60'
                              }`}
                            >
                              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
                                {pl.image ? (
                                  <img src={pl.image} alt={pl.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <ListMusic className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="truncate font-medium">{pl.name}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {pl.owner || 'Unknown'} - {pl.trackCount} tracks
                                </div>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>

                {selectedPlaylist && (
                  <div className="flex-1 rounded-lg border bg-white/60 dark:bg-gray-900/50 p-3 space-y-2 flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{selectedPlaylist.name} Tracks</div>
                      <div className="text-xs text-muted-foreground">
                        {playlistTracksLoading ? 'Loading...' : `${playlistTracks.length} tracks`}
                      </div>
                    </div>
                    {playlistTracksError && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                        {playlistTracksError}
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto pr-1 space-y-1">
                      {playlistTracksLoading ? (
                        <div className="text-sm text-muted-foreground">Loading playlist tracks...</div>
                      ) : playlistTracks.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No tracks available for this playlist.</div>
                      ) : (
                        playlistTracks.map((track) => {
                          const isSelected = selectedTrack?.id === track.id
                          return (
                            <div
                              key={track.id}
                              className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${
                                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60'
                              }`}
                            >
                              <button
                                className="flex items-center gap-3 flex-1 text-left"
                                onClick={() => handleSelectTrack(track, false)}
                              >
                                <div className="h-12 w-12 overflow-hidden rounded bg-muted flex-shrink-0">
                                  {track.image ? (
                                    <img src={track.image} alt={track.name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
                                      {track.artists[0] || 'Track'}
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{track.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{track.artists.join(', ')}</div>
                                </div>
                              </button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSelectTrack(track, true)}
                                className="flex-shrink-0"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={68}>
            <div className="h-full overflow-y-auto custom-scrollbar p-4">
              <div className="mb-4 rounded-lg border bg-white/60 dark:bg-gray-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Spotify Device & Playback (Premium required)</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        loadDevices()
                        loadPlaybackState()
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active devices reported. Open Spotify on a device (desktop/mobile/web) and press refresh.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Target device</label>
                    <select
                      value={selectedDeviceId ?? ''}
                      onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Use active device</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name} {device.isActive ? '(active)' : ''} - {device.type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {stateError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {stateError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!selectedTrack?.uri}
                    onClick={async () => {
                      if (!selectedTrack?.uri) return
                      try {
                        await playSpotifyTrack(selectedTrack.uri, selectedDeviceId ?? undefined)
                        await loadPlaybackState()
                      } catch (err) {
                        setStateError(err instanceof Error ? err.message : 'Failed to start playback.')
                      }
                    }}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Play on Spotify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await pauseSpotify(selectedDeviceId ?? undefined)
                        await loadPlaybackState()
                      } catch (err) {
                        setStateError(err instanceof Error ? err.message : 'Failed to pause playback.')
                      }
                    }}
                    className="gap-2"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                </div>

                {playbackState && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{selectedTrack?.name || playbackState.trackUri}</span>
                      <span>
                        {Math.floor(playbackState.progressMs / 1000)}s / {Math.floor(playbackState.durationMs / 1000)}s
                      </span>
                    </div>
                    <Input
                      type="range"
                      min={0}
                      max={playbackState.durationMs || selectedTrack?.durationMs || 0}
                      step={500}
                      value={playbackState.progressMs}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        setPlaybackState((prev) => (prev ? { ...prev, progressMs: next } : prev))
                      }}
                      onMouseUp={async (e) => {
                        const next = Number((e.target as HTMLInputElement).value)
                        await seekSpotify(next, selectedDeviceId ?? undefined)
                        await loadPlaybackState()
                      }}
                      onTouchEnd={async (e) => {
                        const next = Number((e.target as HTMLInputElement).value)
                        await seekSpotify(next, selectedDeviceId ?? undefined)
                        await loadPlaybackState()
                      }}
                    />
                    <div className="text-xs text-muted-foreground">
                      Playback state is read from Spotify; speed control is not available via the API.
                    </div>
                  </div>
                )}
              </div>

              {selectedTrack && (
                <div className="mb-4 rounded-lg border bg-white/60 dark:bg-gray-900/60 p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-44 rounded-lg overflow-hidden bg-muted">
                      {selectedTrack.image ? (
                        <img src={selectedTrack.image} alt={selectedTrack.name} className="w-full" />
                      ) : (
                        <div className="aspect-square flex items-center justify-center text-muted-foreground">
                          <ListMusic className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground uppercase tracking-wide">Track</div>
                      <h2 className="text-2xl font-semibold leading-tight">{selectedTrack.name}</h2>
                      <p className="text-muted-foreground">{selectedTrack.artists.join(', ')}</p>
                      {selectedTrack.album && <p className="text-sm text-muted-foreground">Album: {selectedTrack.album}</p>}
                      {selectedTrack.durationMs ? (
                        <p className="text-sm text-muted-foreground">
                          Duration: {(selectedTrack.durationMs / 1000 / 60).toFixed(1)} min
                        </p>
                      ) : null}
                      {selectedTrack.externalUrl && (
                        <Button asChild variant="default" size="sm" className="gap-2">
                          <a href={selectedTrack.externalUrl} target="_blank" rel="noreferrer">
                            Open in Spotify
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border bg-white/60 dark:bg-gray-900/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Markers & Notes</div>
                  <div className="text-xs text-muted-foreground">
                    Markers loop by seeking on your Spotify device. Recording uses your microphone locally.
                  </div>
                </div>
                <AudioMarkers
                  audioControls={{
                    getCurrentTime: () => (playbackState?.progressMs || 0) / 1000,
                    getDuration: () => {
                      if (selectedTrack?.durationMs) return selectedTrack.durationMs / 1000
                      return (playbackState?.durationMs || 0) / 1000
                    },
                    seek: (time) => {
                      seekSpotify(time * 1000, selectedDeviceId ?? undefined).catch(() => {})
                    },
                    play: () => {
                      if (selectedTrack?.uri) {
                        playSpotifyTrack(selectedTrack.uri, selectedDeviceId ?? undefined).catch(() => {})
                      }
                    }
                  }}
                  markers={markerState.markers}
                  annotations={markerState.annotations}
                  onMarkersChange={(next) => persistMarkerState({ ...markerState, markers: next })}
                  onAnnotationsChange={(next) => persistMarkerState({ ...markerState, annotations: next })}
                  className="mb-4"
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}

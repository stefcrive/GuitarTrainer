'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useYouTubeStore } from '@/stores/youtube-store'
import { useDirectoryStore } from '@/stores/directory-store'
import {
  disconnectYouTubeAccount,
  fetchPlaylistData,
  getYouTubeAuthStatus,
  type YouTubeAuthStatus
} from '@/services/youtube'

export function PlaylistManager() {
  const { playlists, addPlaylist, removePlaylist } = useYouTubeStore()
  const { rootHandle } = useDirectoryStore()
  const [newPlaylistInput, setNewPlaylistInput] = useState('')
  const [error, setError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [authStatus, setAuthStatus] = useState<YouTubeAuthStatus | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const refreshAuthStatus = useCallback(async (force = false) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const status = await getYouTubeAuthStatus(force)
      setAuthStatus(status)
    } catch (error) {
      console.error('Failed to load YouTube auth status:', error)
      setAuthError('Unable to check YouTube connection status.')
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAuthStatus()
  }, [refreshAuthStatus])

  async function handleAddPlaylist() {
    setError('')
    setIsValidating(true)

    try {
      if (!newPlaylistInput.trim()) {
        setError('Please enter a playlist URL or ID')
        return
      }

      if (!rootHandle) {
        setError('Please select a root directory first in Settings')
        return
      }

      const playlistData = await fetchPlaylistData(newPlaylistInput)
      
      await addPlaylist({
        id: playlistData.id,
        title: playlistData.title,
        description: playlistData.description || ''
      }, rootHandle)
      setNewPlaylistInput('')
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('Failed to add playlist. Please try again')
      }
    } finally {
      setIsValidating(false)
    }
  }

  const handleConnect = () => {
    const redirectPath = window.location.pathname || '/settings'
    window.location.href = `/api/youtube/auth?redirect=${encodeURIComponent(redirectPath)}`
  }

  const handleDisconnect = async () => {
    try {
      await disconnectYouTubeAccount()
      await refreshAuthStatus(true)
    } catch (error) {
      console.error('Failed to disconnect YouTube account:', error)
      setAuthError('Failed to disconnect YouTube account.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">YouTube account</p>
            <p className="text-xs text-muted-foreground">
              Connect to access private or YouTube Music playlists.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {authStatus?.authorized ? (
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={authLoading || authStatus?.configured === false}
              >
                Connect
              </Button>
            )}
          </div>
        </div>
        {authLoading && (
          <p className="text-xs text-muted-foreground">Checking connection...</p>
        )}
        {!authLoading && authStatus?.authorized && (
          <p className="text-xs text-muted-foreground">Connected.</p>
        )}
        {!authLoading && authStatus?.configured === false && (
          <p className="text-xs text-muted-foreground">
            OAuth is not configured. Add YouTube OAuth credentials to use private playlists.
          </p>
        )}
        {authError && (
          <p className="text-xs text-destructive">{authError}</p>
        )}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={newPlaylistInput}
          onChange={(e) => setNewPlaylistInput(e.target.value)}
          placeholder="Enter YouTube playlist URL or ID"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isValidating || !rootHandle}
        />
        <p className="text-xs text-muted-foreground">
          Example formats:
          <br />
          - Full URL: https://youtube.com/playlist?list=PLxxxxx
          <br />
          - Playlist ID: PLxxxxx
        </p>
      </div>
      
      <Button 
        onClick={handleAddPlaylist} 
        disabled={isValidating || !rootHandle}
      >
        {isValidating ? 'Validating...' : 'Add Playlist'}
      </Button>
      
      {error && (
        <div className="p-3 text-sm border border-destructive/50 bg-destructive/10 rounded-md whitespace-pre-line">
          {error}
          {error.includes('not accessible') && (
            <div className="mt-2 text-xs">
              Note: Private playlists require a connected YouTube account, or you can make the playlist public.
            </div>
          )}
        </div>
      )}
      
      {rootHandle && (
        <div className="space-y-2 pt-4">
          {playlists.map(playlist => (
            <div key={playlist.id} className="flex items-center justify-between p-3 border rounded-md bg-secondary/10">
              <div className="space-y-1">
                <span className="text-sm font-medium">{playlist.title}</span>
                <p className="text-xs text-muted-foreground break-all">{playlist.id}</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removePlaylist(playlist.id, rootHandle)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

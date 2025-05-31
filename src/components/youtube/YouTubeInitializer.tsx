'use client'

import { useEffect, useState } from 'react'
import { youtubeApi } from '@/services/youtube-api'
import { useYouTubeStore } from '@/stores/youtube-store'

export type YouTubeInitializerProps = {
  children?: React.ReactNode
}

export function YouTubeInitializer({ children }: YouTubeInitializerProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const setInitialized = useYouTubeStore((state) => state.setInitialized)

  useEffect(() => {
    let mounted = true
    let retryCount = 0
    const maxRetries = 3
    const retryDelay = 1000 // 1 second

    const init = async () => {
      try {
        await youtubeApi.loadAPI()
        if (mounted) {
          console.log('YouTube API loaded successfully')
          setInitialized(true)
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to initialize YouTube API:', err)
          if (retryCount < maxRetries) {
            retryCount++
            console.log(`Retrying initialization (attempt ${retryCount}/${maxRetries})...`)
            setTimeout(init, retryDelay)
          } else {
            setError(err instanceof Error ? err.message : 'Unknown error')
            setInitialized(false)
            setIsLoading(false)
          }
        }
      }
    }

    const checkAndInit = () => {
      if (!youtubeApi.isReady()) {
        init()
      } else {
        console.log('YouTube API already loaded')
        setInitialized(true)
        setIsLoading(false)
      }
    }

    checkAndInit()

    return () => {
      mounted = false
    }
  }, [setInitialized])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-700 p-4 rounded">
        <p>Failed to load YouTube player: {error}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted p-4 rounded">
        <p className="text-muted-foreground">Loading YouTube API...</p>
      </div>
    )
  }

  return children || null
}
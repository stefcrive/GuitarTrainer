'use client'

import Script from 'next/script'

export function YouTubeScriptLoader() {
  return (
    <Script
      src="https://www.youtube.com/iframe_api"
      strategy="afterInteractive"
      onLoad={() => {
        console.log('YouTube IFrame API loaded successfully')
      }}
      onError={() => {
        console.error('Error loading YouTube IFrame API')
        // Clean up any partial initialization
        try {
          const win = window as any
          if (win.YT) {
            win.YT = null
          }
        } catch (err) {
          console.error('Error cleaning up YT object:', err)
        }
      }}
    />
  )
}
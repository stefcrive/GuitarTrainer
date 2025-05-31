declare namespace YT {
  class Player {
    constructor(
      elementId: string | HTMLElement,
      options: PlayerOptions
    )

    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    getCurrentTime(): number
    getDuration(): number
    getPlayerState(): number
    destroy(): void
    setPlaybackRate(suggestedRate: number): void
    getPlaybackRate(): number
    getAvailablePlaybackRates(): number[]
  }

  interface PlayerOptions {
    videoId?: string
    height?: string | number
    width?: string | number
    playerVars?: {
      autoplay?: 0 | 1
      controls?: 0 | 1
      modestbranding?: 0 | 1
      playsinline?: 0 | 1
      rel?: 0 | 1
      origin?: string
      enablejsapi?: 0 | 1
    }
    events?: {
      onReady?: (event: { target: YT.Player }) => void
      onStateChange?: (event: { data: number }) => void
      onError?: (event: { data: number }) => void
    }
  }

  const PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }

  const loaded: number
}

interface Window {
  YT: typeof YT & { loaded: number }
  onYouTubeIframeAPIReady: () => void
}
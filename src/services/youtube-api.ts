'use client'

import { useYouTubeStore } from '@/stores/youtube-store'

// Track API loading state
let apiLoaded = false
let apiLoading = false
let loadPromise: Promise<void> | null = null
let initializeTimeout: NodeJS.Timeout | null = null
let initializeAttempt = 0
const MAX_INITIALIZE_ATTEMPTS = 3

export function resetApiState() {
  apiLoaded = false
  apiLoading = false
  loadPromise = null
  if (initializeTimeout) {
    clearTimeout(initializeTimeout)
    initializeTimeout = null
  }
  // Clean up YT object if it exists
  if (typeof window !== 'undefined') {
    const win = window as any
    if (win.YT) {
      win.YT = null
    }
  }
  useYouTubeStore.getState().setInitialized(false)
}

export const youtubeApi = {
  loadAPI(): Promise<void> {
    // Return existing promise if already loading
    if (loadPromise) {
      return loadPromise
    }

    // If already loaded, resolve immediately
    if (apiLoaded && window.YT?.loaded) {
      useYouTubeStore.getState().setInitialized(true)
      return Promise.resolve()
    }

    // Create new load promise
    loadPromise = new Promise((resolve, reject) => {
      try {
        // Set the global callback that YouTube will call
        window.onYouTubeIframeAPIReady = () => {
          console.log('YouTube API ready')
          apiLoaded = true
          apiLoading = false
          useYouTubeStore.getState().setInitialized(true)
          resolve()
        }

        // Add the script tag if not already present
        if (!document.getElementById('youtube-iframe-api')) {
          console.log('Loading YouTube IFrame API script...')
          apiLoading = true
          
          const script = document.createElement('script')
          script.id = 'youtube-iframe-api'
          script.src = 'https://www.youtube.com/iframe_api'
          script.async = true
          script.onerror = (error) => {
            console.error('Failed to load YouTube API:', error)
            apiLoading = false
            apiLoaded = false
            loadPromise = null
            reject(new Error('Failed to load YouTube API'))
          }
          
          document.head.appendChild(script)
        } else {
          console.log('YouTube API script already exists')
        }
      } catch (error) {
        console.error('Error loading YouTube API:', error)
        apiLoading = false
        apiLoaded = false
        loadPromise = null
        reject(error)
      }
    })

    // Add cleanup to promise
    loadPromise.catch(() => {
      loadPromise = null
    })

    return loadPromise
  },

  resetApiState,

  initialize(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()

    return new Promise((resolve, reject) => {
      const attemptInitialize = () => {
        initializeAttempt++
        console.log(`Attempting to initialize YouTube API (attempt ${initializeAttempt}/${MAX_INITIALIZE_ATTEMPTS})`)
        
        this.loadAPI()
          .then(resolve)
          .catch(err => {
            console.error(`Failed to initialize YouTube API (attempt ${initializeAttempt}):`, err)
            
            if (initializeAttempt < MAX_INITIALIZE_ATTEMPTS) {
              console.log('Retrying initialization...')
              resetApiState()
              // Wait longer between each attempt
              initializeTimeout = setTimeout(attemptInitialize, 2000 * initializeAttempt)
            } else {
              console.error('Max initialization attempts reached')
              resetApiState()
              reject(new Error('Failed to initialize YouTube API after multiple attempts'))
            }
          })
      }

      attemptInitialize()
    })
  },

  isReady(): boolean {
    return apiLoaded &&
           typeof window !== 'undefined' &&
           !!window.YT?.loaded &&
           typeof window.YT.Player === 'function'
  },

  ensurePlayerAPI(): Promise<void> {
    if (this.isReady()) {
      return Promise.resolve()
    }

    // Reset state if YT exists but Player is not available
    if (typeof window !== 'undefined' && window.YT && !window.YT.Player) {
      resetApiState()
    }

    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 20
      const checkInterval = 250

      const checkAPI = () => {
        if (this.isReady()) {
          resolve()
          return true
        }
        
        if (++attempts >= maxAttempts) {
          const error = new Error('YouTube API failed to initialize properly')
          console.error(error)
          resetApiState()
          reject(error)
          return true
        }

        return false
      }

      // Initial check
      if (checkAPI()) return

      // Set up interval for subsequent checks
      const interval = setInterval(() => {
        if (checkAPI()) {
          clearInterval(interval)
        }
      }, checkInterval)

      // Safety timeout
      setTimeout(() => {
        clearInterval(interval)
        if (!this.isReady()) {
          const error = new Error('YouTube API initialization timed out')
          console.error(error)
          resetApiState()
          reject(error)
        }
      }, maxAttempts * checkInterval + 1000)
    })
  }
}
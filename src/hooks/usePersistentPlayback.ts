'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { usePlaybackStore, type PlaybackSession } from '@/stores/playback-store'

export const PracticeRouteContext = createContext<string | null>(null)

type Transport = Omit<PlaybackSession, 'owner' | 'href' | 'isPlaying'> & {
  isPlaying: boolean
}

export function usePersistentPlayback(transport: Transport) {
  const pathname = usePathname()
  const practiceRoute = useContext(PracticeRouteContext)
  const latest = useRef(transport)
  latest.current = transport
  const route = useRef(practiceRoute ?? pathname)
  const session = useRef<PlaybackSession>()
  if (!session.current) {
    session.current = {
      owner: Symbol('playback'),
      get title() { return latest.current.title },
      get href() { return route.current },
      getCurrentTime: () => latest.current.getCurrentTime(),
      getDuration: () => latest.current.getDuration(),
      isPlaying: () => latest.current.isPlaying,
      play: () => latest.current.play(),
      pause: () => latest.current.pause(),
      seek: (time) => latest.current.seek(time)
    }
  }

  useEffect(() => {
    if (transport.isPlaying) usePlaybackStore.getState().activate(session.current!)
  }, [transport.isPlaying])

  useEffect(() => {
    const owner = session.current!.owner
    return () => usePlaybackStore.getState().release(owner)
  }, [])
}

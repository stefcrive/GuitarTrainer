'use client'

import { Suspense, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useSearchParams } from 'next/navigation'
import { WorkspaceActiveContext, WorkspaceSearchContext } from '@/hooks/useWorkspaceNavigation'
import { retainWorkspaceNavigation, type WorkspaceNavigation } from '@/lib/workspace-navigation'
import { PracticeRouteContext } from '@/hooks/usePersistentPlayback'
import { usePlaybackStore } from '@/stores/playback-store'
import { PlaybackBar } from './PlaybackBar'

const workspaces = {
  '/': dynamic(() => import('@/components/practice/HomePractice')),
  '/documents': dynamic(() => import('@/components/practice/DocumentPractice')),
  '/markers': dynamic(() => import('@/components/practice/MarkersPractice')),
  '/scales': dynamic(() => import('@/components/practice/ScalesPractice')),
  '/settings': dynamic(() => import('@/components/practice/SettingsPractice')),
  '/videos': dynamic(() => import('@/components/practice/VideoPractice')),
  '/audio': dynamic(() => import('@/components/practice/AudioPractice')),
  '/youtube': dynamic(() => import('@/components/practice/YouTubePractice')),
  '/spotify': dynamic(() => import('@/components/practice/SpotifyPractice')),
  '/recent': dynamic(() => import('@/components/practice/RecentPractice')),
  '/favorites': dynamic(() => import('@/components/practice/FavoritesPractice'))
}
const YouTubeVideoPractice = dynamic(() => import('@/components/practice/YouTubeVideoPractice'))

export function PracticeShell({ children }: { children: ReactNode }) {
  return <Suspense><PersistentWorkspaces>{children}</PersistentWorkspaces></Suspense>
}

function PersistentWorkspaces({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const active = usePlaybackStore((state) => state.active)
  const hasError = usePlaybackStore((state) => Boolean(state.error))
  const isPractice = pathname in workspaces || /^\/youtube\/[^/]+$/.test(pathname)
  const [navigation, setNavigation] = useState<WorkspaceNavigation>({ pathname: '', search: '', pages: {} })
  const next = retainWorkspaceNavigation(navigation, pathname, search, isPractice)
  if (next !== navigation) setNavigation(next)

  const showBar = Boolean(active && (active.href !== pathname || hasError))
  return (
    <div className="practice-shell relative h-screen" data-playback-bar={showBar || undefined} data-playback-error={hasError || undefined}>
      {/* Keep each visited subtree in place, including its scroll containers,
          document reader, filters and dialogs. Unvisited pages stay unloaded. */}
      {Object.keys(next.pages).map((path) => {
        const Workspace = workspaces[path as keyof typeof workspaces]
        return (
          <PracticeRouteContext.Provider key={path} value={path}>
            <WorkspaceActiveContext.Provider value={path === pathname}>
              <WorkspaceSearchContext.Provider value={next.pages[path]}>
                <div hidden={path !== pathname} className="practice-workspace h-full">
                  {Workspace ? <Workspace /> : <YouTubeVideoPractice params={{ videoId: decodeURIComponent(path.split('/')[2]) }} />}
                </div>
              </WorkspaceSearchContext.Provider>
            </WorkspaceActiveContext.Provider>
          </PracticeRouteContext.Provider>
        )
      })}
      {!isPractice && <div className="practice-workspace h-full">{children}</div>}
      {showBar && <PlaybackBar />}
    </div>
  )
}

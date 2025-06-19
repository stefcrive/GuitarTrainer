'use client'

import Link from 'next/link'
import { useDirectoryStore } from '@/stores/directory-store'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export function Header() {
  const { rootHandle, audioRootHandle } = useDirectoryStore()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-4 flex h-14 items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Guitar Course Manager</h1>
          {(rootHandle || audioRootHandle) && (
            <span className="text-sm text-muted-foreground">
              {rootHandle && `Videos: ${rootHandle.name}`}
              {rootHandle && audioRootHandle && ' | '}
              {audioRootHandle && `Audio: ${audioRootHandle.name}`}
            </span>
          )}
        </div>
        <nav className="flex gap-4">
          <Link href="/" className="text-sm font-medium hover:text-primary">
            Videos
          </Link>
          <Link href="/youtube" className="text-sm font-medium hover:text-primary">
            YouTube
          </Link>
          <Link href="/audio" className="text-sm font-medium hover:text-primary">
            Audio
          </Link>
          <Link href="/markers" className="text-sm font-medium hover:text-primary">
            Markers
          </Link>
          <Link href="/recent" className="text-sm font-medium hover:text-primary">
            Recent
          </Link>
          <Link href="/favorites" className="text-sm font-medium hover:text-primary">
            Favorites
          </Link>
          <Link href="/settings" className="text-sm font-medium hover:text-primary">
            Settings
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
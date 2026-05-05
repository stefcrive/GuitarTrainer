'use client'

import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Clock, FolderHeart, ListMusic, Music, Settings, SlidersHorizontal, Video, Youtube, Guitar } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  const primaryActions = [
    { title: 'Videos', description: 'Local lesson files and markers', href: '/videos', icon: Video },
    { title: 'Audio', description: 'Tracks, loops, recordings, and notes', href: '/audio', icon: Music },
    { title: 'YouTube', description: 'Playlist lessons with saved markers', href: '/youtube', icon: Youtube },
    { title: 'Spotify', description: 'Playlist playback and practice markers', href: '/spotify', icon: ListMusic },
  ]

  const secondaryActions = [
    { title: 'Markers', href: '/markers', icon: SlidersHorizontal },
    { title: 'Recent', href: '/recent', icon: Clock },
    { title: 'Favorites', href: '/favorites', icon: FolderHeart },
    { title: 'Scales', href: '/scales', icon: Guitar },
    { title: 'Settings', href: '/settings', icon: Settings },
  ]

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <section className="border-b pb-5">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold">Practice Desk</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Start from a source, review saved work, or jump into fretboard study.
              </p>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {primaryActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex min-h-28 flex-col justify-between rounded-md border bg-background p-4 transition-colors hover:bg-muted/45"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Open</span>
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">{action.title}</h2>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                </Link>
              )
            })}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="rounded-md border bg-background">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Resume Work</h2>
              </div>
              <EmptyState
                icon={Clock}
                title="Use Recent or Favorites to resume a practice item"
                description="Those lists keep their existing saved state and open directly into the player workspace."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/recent">Recent</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/favorites">Favorites</Link>
                    </Button>
                  </div>
                }
              />
            </div>

            <div className="rounded-md border bg-background">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Tools</h2>
              </div>
              <div className="grid gap-1 p-2">
                {secondaryActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <Button key={action.href} asChild variant="ghost" className="justify-start gap-2">
                      <Link href={action.href}>
                        <Icon className="h-4 w-4" />
                        {action.title}
                      </Link>
                    </Button>
                  )
                })}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

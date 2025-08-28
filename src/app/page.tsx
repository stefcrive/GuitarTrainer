'use client'

import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Music, Video, Youtube, Clock, Heart, Settings } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center">
        <div className="max-w-4xl mx-auto p-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Guitar Trainer</h1>
            <p className="text-xl text-muted-foreground">
              Practice guitar with videos, audio files, and YouTube content
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href="/videos">
              <Button
                variant="outline"
                className="h-32 w-full flex flex-col items-center justify-center gap-3 text-lg hover:bg-accent"
              >
                <Video className="h-8 w-8" />
                <span>Local Videos</span>
              </Button>
            </Link>
            
            <Link href="/audio">
              <Button
                variant="outline"
                className="h-32 w-full flex flex-col items-center justify-center gap-3 text-lg hover:bg-accent"
              >
                <Music className="h-8 w-8" />
                <span>Audio Files</span>
              </Button>
            </Link>
            
            <Link href="/youtube">
              <Button
                variant="outline"
                className="h-32 w-full flex flex-col items-center justify-center gap-3 text-lg hover:bg-accent"
              >
                <Youtube className="h-8 w-8" />
                <span>YouTube</span>
              </Button>
            </Link>
            
            <Link href="/recent">
              <Button
                variant="outline"
                className="h-32 w-full flex flex-col items-center justify-center gap-3 text-lg hover:bg-accent"
              >
                <Clock className="h-8 w-8" />
                <span>Recent</span>
              </Button>
            </Link>
            
            <Link href="/favorites">
              <Button
                variant="outline"
                className="h-32 w-full flex flex-col items-center justify-center gap-3 text-lg hover:bg-accent"
              >
                <Heart className="h-8 w-8" />
                <span>Favorites</span>
              </Button>
            </Link>
            
            <Link href="/settings">
              <Button
                variant="outline"
                className="h-32 w-full flex flex-col items-center justify-center gap-3 text-lg hover:bg-accent"
              >
                <Settings className="h-8 w-8" />
                <span>Settings</span>
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { useDirectoryStore } from '@/stores/directory-store'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'

const VideoMarkersList = dynamic(
  () => import('@/components/video/VideoMarkersList'),
  { ssr: false }
)

export default function MarkersPage(): React.ReactElement {
  const { rootHandle } = useDirectoryStore()

  if (!rootHandle) {
    return (
      <div className="flex h-screen flex-col">
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center justify-center gap-4 h-full">
            <p>Please select a root directory in settings first</p>
            <Link
              href="/settings"
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Go to Settings
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return <VideoMarkersList />
}
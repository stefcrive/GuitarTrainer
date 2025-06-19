import React from 'react'
import dynamic from 'next/dynamic'

const VideoMarkersList = dynamic(
  () => import('@/components/video/VideoMarkersList'),
  { ssr: false }
)

export default function MarkersPage(): React.ReactElement {
  return (
    <div className="py-6 px-6">
      <h1 className="text-2xl font-bold mb-6 ml-2">Video Markers</h1>
      <VideoMarkersList />
    </div>
  )
}
import React from 'react'
import dynamic from 'next/dynamic'

const VideoSurfList = dynamic(
  () => import('@/components/video/VideoSurfList'),
  { ssr: false }
)

export default function SurfPage(): React.ReactElement {
  return (
    <div className="py-6 px-6">
      <h1 className="text-2xl font-bold mb-6 ml-2">Surf Video Markers</h1>
      <VideoSurfList />
    </div>
  )
}
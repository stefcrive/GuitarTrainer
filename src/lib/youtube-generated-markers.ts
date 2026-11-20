import type { VideoMarkerState } from '@/types/video'

export function mergeYouTubeGeneratedMarkers(current: VideoMarkerState, generated: VideoMarkerState, videoId: string): VideoMarkerState {
  const prefix = `gtm:youtube:${videoId}:`
  const markers = [...current.markers.filter(marker => !marker.id.startsWith(prefix)), ...generated.markers]
    .sort((a, b) => a.startTime - b.startTime)
  const activeMarkerId = current.activeMarkerId && !current.activeMarkerId.startsWith(prefix)
    && markers.some(marker => marker.id === current.activeMarkerId) ? current.activeMarkerId : null
  return { markers, annotations: [...current.annotations.filter(note => !note.markerId.startsWith(prefix)), ...generated.annotations],
    activeMarkerId, isLooping: activeMarkerId ? current.isLooping : false }
}

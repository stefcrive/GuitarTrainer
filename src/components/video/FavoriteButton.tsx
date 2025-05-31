import { Button } from "@/components/ui/button"
import { Video } from "@/types/video"
import { favoritesService } from "@/services/favorites"
import { Star } from "lucide-react"
import { useState, useEffect } from "react"

interface FavoriteButtonProps {
  video: Video
  directoryHandle?: FileSystemDirectoryHandle | null
  onFavoriteChange?: (isFavorite: boolean) => void
}

export function FavoriteButton({ video, directoryHandle, onFavoriteChange }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    // Check if video is in favorites
    favoritesService.isVideoFavorite(video).then(setIsFavorite)
  }, [video])

  const toggleFavorite = async () => {
    try {
      if (isFavorite) {
        await favoritesService.removeVideoFavorite(video)
        setIsFavorite(false)
      } else {
        if (video.type === 'file' && !directoryHandle) {
          throw new Error("Directory handle required to add file system video to favorites")
        }
        await favoritesService.addVideoFavorite(video, directoryHandle)
        setIsFavorite(true)
      }
      onFavoriteChange?.(!isFavorite)
    } catch (err) {
      console.error("Error toggling favorite:", err)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation() // Prevent video selection when clicking favorite
        toggleFavorite()
      }}
      className={`h-8 w-8 ${isFavorite ? 'text-yellow-500' : 'text-muted-foreground'}`}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
    </Button>
  )
}
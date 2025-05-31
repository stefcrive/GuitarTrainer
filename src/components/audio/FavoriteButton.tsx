import { Button } from "@/components/ui/button"
import { AudioFile, AudioMetadata } from "@/types/audio"
import { favoritesService } from "@/services/favorites"
import { Star } from "lucide-react"
import { useState, useEffect } from "react"

interface FavoriteButtonProps {
  audio: AudioFile
  metadata?: AudioMetadata
  directoryHandle: FileSystemDirectoryHandle
  onFavoriteChange?: (isFavorite: boolean) => void
}

export function FavoriteButton({ audio, metadata, directoryHandle, onFavoriteChange }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    // Check if audio is in favorites
    favoritesService.isAudioFavorite(audio).then(setIsFavorite)
  }, [audio])

  const toggleFavorite = async () => {
    try {
      if (isFavorite) {
        await favoritesService.removeAudioFavorite(audio)
        setIsFavorite(false)
      } else {
        await favoritesService.addAudioFavorite(audio, metadata, directoryHandle)
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
        e.stopPropagation() // Prevent audio selection when clicking favorite
        toggleFavorite()
      }}
      className={`h-8 w-8 ${isFavorite ? 'text-yellow-500' : 'text-muted-foreground'}`}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
    </Button>
  )
}
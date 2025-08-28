'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/ui/tag-input'
import { cn } from '@/lib/utils'
import { useTags } from '@/hooks/useTags'
import { useAllTags } from '@/hooks/useAllTags'

interface VideoAnnotationEditorProps {
  onSave: (text: string, tags: string[]) => void
  onCancel?: () => void
  initialText?: string
  initialTags?: string[]
  className?: string
  clearOnSave?: boolean
  availableTags?: string[]
}

export function VideoAnnotationEditor({
  onSave,
  onCancel,
  initialText = '',
  initialTags = [],
  className,
  clearOnSave = true,
  availableTags: propAvailableTags
}: VideoAnnotationEditorProps) {
  const { addTag, addTags } = useTags() // Keep for saving tags to localStorage
  const allStoredTags = useAllTags() // Get ALL tags from all sources
  const [text, setText] = useState(initialText)
  const [tags, setTags] = useState<string[]>(initialTags)

  // Merge all available tags, prioritizing prop tags if provided
  const availableTags = useMemo(() => {
    const combined = propAvailableTags 
      ? [...new Set([...propAvailableTags, ...allStoredTags])]
      : allStoredTags
    return combined.sort()
  }, [propAvailableTags, allStoredTags])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim() || tags.length > 0) {
      // Save tags to the global tag store
      if (tags.length > 0) {
        addTags(tags)
      }
      onSave(text.trim(), tags)
      // Dispatch custom event to notify tag collection hooks
      window.dispatchEvent(new CustomEvent('annotationSaved'))
      if (clearOnSave) {
        setText('')
        setTags([])
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)}>
      <div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full min-h-[100px] p-2 border rounded-md"
          placeholder="Add your notes here..."
        />
      </div>

      <div>
        <TagInput
          tags={tags}
          onTagsChange={setTags}
          placeholder="Add tags..."
          availableTags={availableTags}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!text.trim() && tags.length === 0}>
          Save Annotation
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
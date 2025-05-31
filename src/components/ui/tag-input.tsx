'use client'

import { useState, KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export interface TagInputProps {
  tags?: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  className?: string
}

export function TagInput({ tags = [], onTagsChange, placeholder = 'Add tag...' }: TagInputProps) {
  const [input, setInput] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      if (!tags.includes(input.trim())) {
        onTagsChange([...tags, input.trim()])
      }
      setInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove))
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map(tag => (
          <div
            key={tag}
            className="flex items-center gap-1 bg-accent text-accent-foreground px-2 py-1 rounded-md text-sm"
          >
            <span>{tag}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-destructive/20"
              onClick={() => removeTag(tag)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full p-2 bg-background border rounded-md text-sm"
      />
    </div>
  )
}
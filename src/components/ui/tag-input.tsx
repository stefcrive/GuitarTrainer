'use client'

import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, ChevronDown } from 'lucide-react'

export interface TagInputProps {
  tags?: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  className?: string
  availableTags?: string[]
}

export function TagInput({
  tags = [],
  onTagsChange,
  placeholder = 'Add tag...',
  availableTags = []
}: TagInputProps) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom')
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Handle selection with arrow keys
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const currentIndex = suggestions.indexOf(input)
        let newIndex
        if (e.key === 'ArrowDown') {
          newIndex = currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1
        }
        setInput(suggestions[newIndex])
        return
      }
    }

    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      if (!tags.includes(input.trim())) {
        onTagsChange([...tags, input.trim()])
      }
      setInput('')
      setSuggestions([])
    }
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    
    // Show suggestions when typing
    if (value.trim()) {
      const filtered = availableTags
        .filter(tag =>
          tag.toLowerCase().includes(value.toLowerCase()) &&
          !tags.includes(tag)
        )
      setSuggestions(filtered)
    } else {
      setSuggestions([])
    }
  }

  // Check if dropdown should appear above or below input
  useEffect(() => {
    if (isDropdownOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropdownHeight = Math.min(availableTags.length * 32, 200) // Approximate height based on items
      
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setDropdownPosition('top')
      } else {
        setDropdownPosition('bottom')
      }
    }
  }, [isDropdownOpen, availableTags.length])

  const handleSuggestionClick = (tag: string) => {
    if (!tags.includes(tag)) {
      onTagsChange([...tags, tag])
    }
    setInput('')
    setSuggestions([])
  }

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove))
  }

  return (
    <div className="w-full relative" ref={containerRef}>
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
      <div className="relative flex">
        <input
          type="text"
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 p-2 bg-background border rounded-l-md text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto border-l-0 rounded-l-none"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        {(suggestions.length > 0 || isDropdownOpen) && (
          <div
            className={`absolute ${
              dropdownPosition === 'top'
                ? 'bottom-full mb-1'
                : 'top-full mt-1'
            } left-0 right-0 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto z-10`}
          >
            {isDropdownOpen
              ? availableTags
                  .filter(tag => !tags.includes(tag))
                  .map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        handleSuggestionClick(tag)
                        setIsDropdownOpen(false)
                      }}
                      className="w-full px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {tag}
                    </button>
                  ))
              : suggestions.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleSuggestionClick(tag)}
                    className="w-full px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {tag}
                  </button>
                ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
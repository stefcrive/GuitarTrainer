'use client'

import { cn } from '@/lib/utils'

interface TagCount {
  tag: string
  count: number
}

export interface TagListProps {
  selectedTags?: string[]
  tagCounts?: TagCount[]
  className?: string
  onClick?: (tag: string) => void
  onTagClick?: (tag: string) => void
  onTagDelete?: (tag: string) => void
}

export function TagList({ selectedTags = [], tagCounts = [], className, onClick, onTagClick, onTagDelete }: TagListProps) {
  if (!tagCounts?.length) return null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {tagCounts.map(({ tag, count }) => (
        <button
          key={tag}
          className={cn(
            'inline-flex items-center justify-between px-3 py-1 rounded-md text-sm',
            selectedTags?.includes(tag) ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground hover:bg-accent/80',
            onClick && 'cursor-pointer'
          )}
          onClick={() => {
            onClick?.(tag)
            onTagClick?.(tag)
          }}
          type="button"
        >
          <span>{tag}</span>
          <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-accent-foreground/10">
            {count}
          </span>
        </button>
      ))}
    </div>
  )
}
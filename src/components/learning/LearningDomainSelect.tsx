'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LEARNING_DOMAIN_OPTIONS, type LearningDomain } from '@/types/learning'

interface LearningDomainSelectProps {
  value?: LearningDomain
  onChange: (value: LearningDomain | undefined) => void
  className?: string
}

export function LearningDomainSelect({
  value,
  onChange,
  className
}: LearningDomainSelectProps) {
  return (
    <Select
      value={value ?? 'uncategorized'}
      onValueChange={(next) => {
        onChange(next === 'uncategorized' ? undefined : next as LearningDomain)
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Domain" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="uncategorized">Uncategorized</SelectItem>
        {LEARNING_DOMAIN_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

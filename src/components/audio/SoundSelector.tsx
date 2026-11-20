'use client'

import { INSTRUMENTS, type Instrument } from '@/lib/instrument-audio'
export function SoundSelector({ label, ariaLabel = label, value, onChange }: { label: string; ariaLabel?: string; value: Instrument; onChange: (value: Instrument) => void }) {
  return <label className="flex items-center gap-2 text-xs">{label}<select aria-label={ariaLabel} className="h-8 w-36 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} onChange={event => onChange(event.target.value as Instrument)}>{INSTRUMENTS.map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>
}

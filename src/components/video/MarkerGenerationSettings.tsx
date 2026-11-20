'use client'

import { useEffect, useId, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Settings = { provider: 'llm' | 'jev'; jevConfigured: boolean; openaiConfigured: boolean }

export function MarkerHelp({ label, align = 'start', side = 'bottom' }: { label: string; align?: 'start' | 'end'; side?: 'top' | 'bottom' }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="More information" aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
        onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); event.preventDefault(); event.stopPropagation() } }}
        className="rounded p-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && <span id={id} role="tooltip" className={`absolute ${align === 'end' ? 'right-0' : 'left-0'} ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} z-50 w-56 rounded-md border bg-popover px-2 py-1 text-xs font-normal text-popover-foreground shadow-lg`}>{label}</span>}
    </span>
  )
}

export function MarkerGenerationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [jevKey, setJevKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/marker-generation-settings', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load marker generation settings.')
        setSettings(await response.json())
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])

  const save = async (remove?: 'jev' | 'openai') => {
    if (!settings) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/marker-generation-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          jevApiKey: remove === 'jev' ? '' : jevKey.trim() || undefined,
          openaiApiKey: remove === 'openai' ? '' : openaiKey.trim() || undefined
        })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save settings.')
      setSettings(payload)
      setJevKey('')
      setOpenaiKey('')
      setMessage(remove ? 'API key removed.' : 'Settings saved.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border p-4 space-y-3" aria-labelledby="marker-generation-heading">
      <div className="flex items-center gap-2">
        <h3 id="marker-generation-heading" className="text-lg font-semibold">AI services and marker generation</h3>
        <MarkerHelp label="Each marker covers one complete teaching unit, including its played examples. Pauses and audio sections do not split markers." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
        <label htmlFor="marker-provider">Topic decisions</label>
        <select id="marker-provider" value={settings?.provider ?? 'llm'} disabled={!settings || saving}
          onChange={event => { setSettings(current => current && ({ ...current, provider: event.target.value as Settings['provider'] })); setMessage(null) }}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="llm">LLM only</option>
          <option value="jev">Jev + LLM</option>
        </select>
        <span />
        <label htmlFor="jev-api-key">Jev API key</label>
        <Input id="jev-api-key" type="password" autoComplete="new-password" spellCheck={false}
          value={jevKey} onChange={event => { setJevKey(event.target.value); setMessage(null) }} disabled={!settings || saving}
          placeholder={settings?.jevConfigured ? 'Configured - enter to replace' : 'TypeSafe API key'} />
        <Button variant="ghost" size="sm" disabled={!settings?.jevConfigured || saving} onClick={() => void save('jev')} aria-label="Remove Jev API key">Remove</Button>
        <div className="flex items-center gap-1">
          <label htmlFor="marker-openai-key">OpenAI API key</label>
          <MarkerHelp label="Shared by marker generation and GPT notation recognition (GPT-6 Astra). Selecting GPT sends the captured image to OpenAI and uses your API billing. Keys are stored server-side and never returned to the browser." />
        </div>
        <Input id="marker-openai-key" type="password" autoComplete="new-password" spellCheck={false}
          value={openaiKey} onChange={event => { setOpenaiKey(event.target.value); setMessage(null) }} disabled={!settings || saving}
          placeholder={settings?.openaiConfigured ? 'Configured - enter to replace' : 'OpenAI API key'} />
        <Button variant="ghost" size="sm" disabled={!settings?.openaiConfigured || saving} onClick={() => void save('openai')} aria-label="Remove OpenAI API key">Remove</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!settings || saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</Button>
        {message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
        {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
      </div>
    </section>
  )
}

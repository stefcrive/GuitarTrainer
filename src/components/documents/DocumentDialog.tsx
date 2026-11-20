'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function DocumentDialog({ title, children, onClose, wide = false, className, contentClassName, footer }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string; contentClassName?: string; footer?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close() }, [])
  return <dialog ref={dialog} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose() }}
    className={cn(`max-h-[90vh] w-[calc(100%-1rem)] ${wide ? 'max-w-4xl' : 'max-w-lg'} overflow-y-auto rounded-md border bg-background p-3 text-foreground shadow-lg backdrop:bg-black/50`, className)}>
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2"><h2 id={id} className="truncate text-sm font-semibold">{title}</h2>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Close dialog" onClick={onClose}><X className="h-4 w-4" /></Button></div>
    <div className={contentClassName}>{children}</div>
    {footer && <div className="shrink-0 border-t pt-2 mt-2">{footer}</div>}
  </dialog>
}

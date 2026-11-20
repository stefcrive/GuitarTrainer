"use client"

import { useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import { PracticeRouteContext } from "@/hooks/usePersistentPlayback"
import { usePlaybackStore } from "@/stores/playback-store"

interface WorkspaceLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  sidebarLabel?: string
  contentLabel?: string
  defaultSidebarSize?: number
  className?: string
  mobileView?: "library" | "practice"
  onMobileViewChange?: (view: "library" | "practice") => void
}

export function WorkspaceLayout({
  sidebar,
  children,
  sidebarLabel = "Library",
  contentLabel = "Practice",
  defaultSidebarSize = 30,
  className,
  mobileView: controlledMobileView,
  onMobileViewChange
}: WorkspaceLayoutProps) {
  const [uncontrolledMobileView, setUncontrolledMobileView] = useState<"library" | "practice">("library")
  const pathname = usePathname()
  const practiceRoute = useContext(PracticeRouteContext)
  const activeHref = usePlaybackStore((state) => state.active?.href)
  const previousActiveHref = useRef(activeHref)
  const mobileView = controlledMobileView ?? uncontrolledMobileView

  const setMobileView = (view: "library" | "practice") => {
    setUncontrolledMobileView(view)
    onMobileViewChange?.(view)
  }

  useEffect(() => {
    const playbackChanged = previousActiveHref.current !== activeHref
    previousActiveHref.current = activeHref
    if (!playbackChanged) return
    if (activeHref && activeHref === pathname && activeHref === practiceRoute) {
      setUncontrolledMobileView('practice')
      onMobileViewChange?.('practice')
    }
  }, [activeHref, pathname, practiceRoute, onMobileViewChange])

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="border-b bg-background p-2 md:hidden">
        <SegmentedControl
          className="w-full"
          value={mobileView}
          onValueChange={setMobileView}
          options={[
            { value: "library", label: sidebarLabel },
            { value: "practice", label: contentLabel }
          ]}
        />
      </div>
      {/* Keep one tree at every breakpoint so resizing cannot destroy playback. */}
      <ResizablePanelGroup direction="horizontal" className="h-full min-h-0">
        <ResizablePanel className={cn("md:block", mobileView !== "library" && "hidden")} defaultSize={defaultSidebarSize} minSize={20} maxSize={48}>
          {sidebar}
        </ResizablePanel>
        <ResizableHandle className="hidden md:flex" />
        <ResizablePanel className={cn("md:block", mobileView !== "practice" && "hidden")} defaultSize={100 - defaultSidebarSize}>
          {children}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

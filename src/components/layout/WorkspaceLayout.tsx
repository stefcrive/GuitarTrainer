"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"

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
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  const mobileView = controlledMobileView ?? uncontrolledMobileView

  const setMobileView = (view: "library" | "practice") => {
    setUncontrolledMobileView(view)
    onMobileViewChange?.(view)
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)")
    const updateViewport = () => setIsDesktop(mediaQuery.matches)

    updateViewport()
    mediaQuery.addEventListener("change", updateViewport)
    return () => mediaQuery.removeEventListener("change", updateViewport)
  }, [])

  if (isDesktop === null) {
    return null
  }

  return (
    <div className={cn("h-full min-h-0", className)}>
      {!isDesktop ? (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b bg-background p-2">
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
        <div className={cn("min-h-0 flex-1", mobileView === "library" ? "block" : "hidden")}>
          {sidebar}
        </div>
        <div className={cn("min-h-0 flex-1", mobileView === "practice" ? "block" : "hidden")}>
          {children}
        </div>
      </div>
      ) : (
      <ResizablePanelGroup direction="horizontal" className="h-full min-h-0">
          <ResizablePanel defaultSize={defaultSidebarSize} minSize={20} maxSize={48}>
            {sidebar}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={100 - defaultSidebarSize}>
            {children}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}

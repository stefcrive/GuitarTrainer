"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Clock,
  FolderHeart,
  Guitar,
  Library,
  ListMusic,
  Menu,
  Music,
  Settings,
  SlidersHorizontal,
  Video,
  Youtube
} from "lucide-react"

export const navigation = [
  { name: "Videos", href: "/videos", icon: Video, group: "Practice" },
  { name: "Audio", href: "/audio", icon: Music, group: "Practice" },
  { name: "YouTube", href: "/youtube", icon: Youtube, group: "Practice" },
  { name: "Spotify", href: "/spotify", icon: ListMusic, group: "Practice" },
  { name: "Markers", href: "/markers", icon: SlidersHorizontal, group: "Library" },
  { name: "Recent", href: "/recent", icon: Clock, group: "Library" },
  { name: "Favorites", href: "/favorites", icon: FolderHeart, group: "Library" },
  { name: "Scales", href: "/scales", icon: Guitar, group: "Tools" },
  { name: "Settings", href: "/settings", icon: Settings, group: "System" },
]

export function Header() {
  const pathname = usePathname()
  const current = navigation.find((item) => pathname === item.href) ?? {
    name: "Practice Desk",
    href: "/",
    icon: Library,
    group: "Home"
  }
  const CurrentIcon = current.icon
  const groups = Array.from(new Set(navigation.map((item) => item.group)))

  return (
    <>
      <header className="fixed left-0 top-0 z-50 flex h-14 w-full items-center gap-2 border-b bg-background px-3 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/" className="gap-2">
                <Library className="h-4 w-4" />
                Practice Desk
              </Link>
            </DropdownMenuItem>
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <CurrentIcon className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{current.name}</div>
        <ThemeToggle />
      </header>

      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[var(--app-sidebar-width)] flex-col border-r bg-background md:flex">
        <Link href="/" className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/35">
            <Guitar className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Guitar Trainer</div>
            <div className="truncate text-xs text-muted-foreground">Practice workspace</div>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto p-3">
          <Link
            href="/"
            className={cn(
              "mb-3 flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
              pathname === "/" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Library className="h-4 w-4" />
            Practice Desk
          </Link>

          {groups.map((group) => (
            <div key={group} className="mb-4">
              <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">{group}</div>
              <div className="space-y-1">
                {navigation.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  )
}

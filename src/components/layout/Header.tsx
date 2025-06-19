"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"

export function Header() {
  const pathname = usePathname()

  const navigation = [
    { name: "Videos", href: "/" },
    { name: "Audio", href: "/audio" },
    { name: "YouTube", href: "/youtube" },
    { name: "Markers", href: "/markers" },
    { name: "Recent", href: "/recent" },
    { name: "Favorites", href: "/favorites" },
    { name: "Scales & Chords", href: "/scales" },
    { name: "Settings", href: "/settings" },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block">
              Guitar Course Manager
            </span>
          </Link>
        </div>
        <nav className="flex items-center space-x-6 text-sm font-medium">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "transition-colors hover:text-foreground/80",
                pathname === item.href ? "text-foreground" : "text-foreground/60"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <ThemeToggle />
      </div>
    </header>
  )
}
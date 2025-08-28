import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { YouTubeInitializer } from "@/components/youtube/YouTubeInitializer"
import { ThemeProvider } from "@/components/theme-provider"
import { FloatingPlayerProvider } from "@/contexts/floating-player-context"
import { FloatingPlayer } from "@/components/floating/FloatingPlayer"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Guitar Course Manager",
  description: "Manage and practice with your guitar video courses",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} no-global-scroll bg-background antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <FloatingPlayerProvider>
            <YouTubeInitializer />
            <div className="relative flex h-screen flex-col">
              {children}
            </div>
            <FloatingPlayer />
          </FloatingPlayerProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

import { Header } from '@/components/layout/Header'

interface MarkersLayoutProps {
  children: React.ReactNode
}

export default function MarkersLayout({ children }: MarkersLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  )
}

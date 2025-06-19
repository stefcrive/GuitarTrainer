import { Header } from '@/components/layout/Header'

interface MarkersLayoutProps {
  children: React.ReactNode
}

export default function MarkersLayout({ children }: MarkersLayoutProps) {
  return (
    <div>
      <Header />
      {children}
    </div>
  )
}
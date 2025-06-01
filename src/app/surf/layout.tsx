import { Header } from '@/components/layout/Header'

interface SurfLayoutProps {
  children: React.ReactNode
}

export default function SurfLayout({ children }: SurfLayoutProps) {
  return (
    <div>
      <Header />
      {children}
    </div>
  )
}
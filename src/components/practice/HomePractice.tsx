'use client'

import { Header } from '@/components/layout/Header'
import { LearningDashboard } from '@/components/learning/LearningDashboard'

export default function HomePage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <LearningDashboard />
      </main>
    </div>
  )
}

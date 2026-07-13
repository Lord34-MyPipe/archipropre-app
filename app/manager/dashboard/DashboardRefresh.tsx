'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardRefresh() {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh()
    }, 120_000)
    return () => clearInterval(timer)
  }, [router])

  return null
}

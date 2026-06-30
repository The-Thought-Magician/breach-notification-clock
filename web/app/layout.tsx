import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BreachNotificationClock',
  description: 'Statutory and contractual breach-notification deadline engine and notice tracker for privacy and security teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}

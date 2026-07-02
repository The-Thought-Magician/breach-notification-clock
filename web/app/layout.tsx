import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BreachNotificationClock',
  description: 'Statutory and contractual breach-notification deadline engine and notice tracker for privacy and security teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="bg-neutral-950 text-neutral-100 min-h-screen antialiased font-sans">{children}</body>
    </html>
  )
}

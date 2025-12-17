import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ESSL Dashboard | Biometric Access Control',
  description: 'Access and manage ESSL biometric device data - Users, Attendance logs, and Device Information',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}


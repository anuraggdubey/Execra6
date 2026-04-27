import { Inter, Manrope } from "next/font/google"
import "./globals.css"
import { AgentProvider } from "@/lib/AgentContext"
import { ThemeProvider } from "@/components/ThemeProvider"
import { WalletProvider } from "@/lib/WalletContext"
import AppShell from "@/components/layout/AppShell"
import type { Metadata } from "next"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

export const metadata: Metadata = {
  title: "Execra",
  description: "Execra is a calmer control surface for tool-driven work.",
  icons: {
    icon: "/execra-logo.png",
    shortcut: "/execra-logo.png",
    apple: "/execra-logo.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${manrope.variable} min-h-screen bg-background text-foreground antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <WalletProvider>
            <AgentProvider>
              <AppShell>{children}</AppShell>
            </AgentProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

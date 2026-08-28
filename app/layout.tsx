import "./globals.css"
import { AgentProvider } from "@/lib/AgentContext"
import { ThemeProvider } from "@/components/ThemeProvider"
import { WalletProvider } from "@/lib/WalletContext"
import AppShell from "@/components/layout/AppShell"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Execra",
  description: "Execra is a calmer control surface for tool-driven work.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
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

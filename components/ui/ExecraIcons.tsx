"use client"

import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

function SvgFrame({ size = 14, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function OrbitMark({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="8" cy="10" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14.9" cy="6.2" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function GitHubAgentIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M4.25 3.25 2.5 5v3.5l1.75 1.75h3.5L9.5 8.5V5L7.75 3.25Z" />
      <path d="M8.25 5.25 6.5 7v3.5l1.75 1.75h3.5L13.5 10.5V7l-1.75-1.75Z" />
    </SvgFrame>
  )
}

export function CodingAgentIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M8.75 3 4.5 7l4.25 4" />
      <path d="M10 2.75v8.5" />
    </SvgFrame>
  )
}

export function DocumentAgentIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="2.5" y="2.5" width="9" height="9" rx="0.75" />
      <path d="M4.5 5.25h5" />
      <path d="M4.5 7.25h4" />
      <path d="M4.5 9.25h3" />
    </SvgFrame>
  )
}

export function EmailAgentIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M7 2.5 11.5 7 7 11.5 2.5 7 7 2.5Z" />
      <path d="M4.1 8.9 7 6.4 9.9 8.9" />
    </SvgFrame>
  )
}

export function SearchAgentIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M7 1.75v10.5" />
      <path d="M1.75 7h10.5" />
    </SvgFrame>
  )
}

export function BrowserAgentIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="2" y="2.75" width="10" height="8.5" rx="0.75" />
      <circle cx="4" cy="4.75" r="0.6" fill="currentColor" stroke="none" />
      <path d="M2.75 6.25h8.5" />
    </SvgFrame>
  )
}

export function PlayTriangleIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M4.25 3.5 10.25 7l-6 3.5Z" />
    </SvgFrame>
  )
}

export function StatusDot({
  tone = "success",
  className = "",
}: {
  tone?: "success" | "warning" | "danger" | "neutral"
  className?: string
}) {
  const color =
    tone === "success"
      ? "var(--ex-success)"
      : tone === "warning"
        ? "var(--ex-warning)"
        : tone === "danger"
          ? "var(--ex-danger)"
          : "var(--ex-ink-3)"

  return <span className={className} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "999px", background: color }} />
}

"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost"
    children: ReactNode
}

export default function ActionButton({
    variant = "primary",
    className = "",
    children,
    ...props
}: ActionButtonProps) {
    const styles =
        variant === "primary"
            ? "bg-[linear-gradient(135deg,#6366f1,#4f46e5)] text-white shadow-[0_12px_28px_rgba(99,102,241,0.28)] hover:-translate-y-0.5"
            : variant === "secondary"
                ? "bg-surface text-foreground ring-1 ring-black/5 hover:bg-surface-elevated"
                : "bg-transparent text-foreground-soft hover:bg-surface-elevated hover:text-foreground"

    return (
        <button
            {...props}
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`.trim()}
        >
            {children}
        </button>
    )
}

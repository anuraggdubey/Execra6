"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost"
    size?: "sm" | "md"
    children: ReactNode
}

export default function ActionButton({
    variant = "primary",
    size = "md",
    className = "",
    children,
    ...props
}: ActionButtonProps) {
    const styles =
        variant === "primary"
            ? "bg-primary text-white hover:opacity-90"
            : variant === "secondary"
                ? "bg-surface-elevated text-foreground hover:bg-surface-elevated/80"
                : "bg-transparent text-foreground-soft hover:bg-surface-elevated hover:text-foreground"

    const sizeStyles =
        size === "sm"
            ? "min-h-[32px] rounded-lg px-3 py-1.5 text-[12px] gap-1.5"
            : "min-h-[36px] rounded-xl px-4 py-2 text-[13px] gap-2"

    return (
        <button
            {...props}
            className={`inline-flex items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${sizeStyles} ${className}`.trim()}
        >
            {children}
        </button>
    )
}

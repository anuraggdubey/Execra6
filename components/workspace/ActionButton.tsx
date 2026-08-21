// Execra Platform
"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { PlayTriangleIcon } from "@/components/ui/ExecraIcons"

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
            ? "button-primary"
            : variant === "secondary"
                ? "button-secondary"
                : "bg-transparent text-foreground-soft hover:text-foreground"

    const sizeStyles =
        size === "sm"
            ? "min-h-[36px] px-3 py-1.5 text-[12px] gap-1.5"
            : "min-h-[42px] px-4 py-2 text-[12px] gap-2"

    return (
        <button
            {...props}
            className={`inline-flex items-center justify-center font-heading tracking-[0.04em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${sizeStyles} ${className}`.trim()}
        >
            {variant === "primary" && <PlayTriangleIcon size={10} />}
            {children}
        </button>
    )
}

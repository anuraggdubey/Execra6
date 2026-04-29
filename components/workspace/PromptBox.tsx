"use client"

type PromptBoxProps = {
    value: string
    onChange: (value: string) => void
    placeholder: string
    disabled?: boolean
    rows?: number
    className?: string
}

export default function PromptBox({
    value,
    onChange,
    placeholder,
    disabled = false,
    rows = 6,
    className = "",
}: PromptBoxProps) {
    return (
        <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full rounded-xl bg-background px-3 py-3 text-[13px] leading-6 text-foreground placeholder:text-muted transition-all duration-150 focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60 ${className}`.trim()}
        />
    )
}

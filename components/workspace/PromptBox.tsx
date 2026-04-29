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
            className={`w-full rounded-[22px] bg-background px-4 py-4 text-sm leading-7 text-foreground placeholder:text-muted ring-1 ring-black/5 transition-all duration-200 focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60 ${className}`.trim()}
        />
    )
}

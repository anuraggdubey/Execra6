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
            className={`w-full rounded-[4px] border border-border bg-background px-3 py-3 font-heading text-[13px] leading-6 tracking-[0.02em] text-foreground placeholder:text-muted transition-all duration-150 focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] disabled:opacity-60 ${className}`.trim()}
        />
    )
}

// Execra Platform
"use client"

import Link from "next/link"
import { OrbitMark } from "@/components/ui/ExecraIcons"

type BrandLogoProps = {
    href?: string
    className?: string
    imageClassName?: string
}

export default function BrandLogo({
    href = "/",
    className = "",
    imageClassName = "",
}: BrandLogoProps) {
    return (
        <Link href={href} aria-label="Execra home" className={`inline-flex shrink-0 items-center gap-2 ${className}`.trim()}>
            <OrbitMark size={20} className={imageClassName || "text-[color:var(--ex-accent)]"} />
            <span className="flex flex-col leading-none">
                <span className="font-heading text-[14px] font-medium tracking-[0.12em] text-foreground">EXECRA</span>
                <span className="hidden font-heading text-[9px] uppercase tracking-[0.14em] text-muted lg:block">
                    Unified Execution Layer
                </span>
            </span>
        </Link>
    )
}

"use client"

import Image from "next/image"
import Link from "next/link"
import logoImage from "@/Screenshots/logo2.png"

type BrandLogoProps = {
    href?: string
    className?: string
    imageClassName?: string
    priority?: boolean
}

export default function BrandLogo({
    href = "/",
    className = "",
    imageClassName = "",
    priority = false,
}: BrandLogoProps) {
    return (
        <Link href={href} aria-label="Execra home" className={`inline-flex shrink-0 items-center gap-1.5 ${className}`.trim()}>
            <Image
                src={logoImage}
                alt="Execra"
                priority={priority}
                className={`h-auto w-[28px] sm:w-[32px] ${imageClassName}`.trim()}
            />
            <span className="text-sm font-bold tracking-tight text-foreground sm:text-base">Execra</span>
        </Link>
    )
}

"use client"

import Image from "next/image"
import Link from "next/link"

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
        <Link href={href} aria-label="Execra home" className={`inline-flex shrink-0 items-center ${className}`.trim()}>
            <Image
                src="/execra-logo.png"
                alt="Execra"
                width={1491}
                height={1055}
                priority={priority}
                className={`h-auto w-[88px] sm:w-[100px] ${imageClassName}`.trim()}
            />
        </Link>
    )
}

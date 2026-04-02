import { NextResponse } from "next/server"

const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"

type WikimediaQueryResponse = {
    query?: {
        pages?: Record<string, {
            title?: string
            imageinfo?: Array<{
                thumburl?: string
                url?: string
            }>
        }>
    }
}

function hashSeed(input: string) {
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0
    }
    return hash.toString(16)
}

function buildFallbackUrl(query: string, slot: number) {
    return `https://picsum.photos/seed/${hashSeed(`${query}-${slot}`)}/1600/900`
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const rawQuery = searchParams.get("q")?.trim()
    const slot = Number.parseInt(searchParams.get("slot") ?? "0", 10)

    if (!rawQuery) {
        return NextResponse.json({ error: "Image query is required" }, { status: 400 })
    }

    const query = rawQuery.slice(0, 120)

    try {
        const commonsUrl = new URL(COMMONS_API_URL)
        commonsUrl.searchParams.set("action", "query")
        commonsUrl.searchParams.set("format", "json")
        commonsUrl.searchParams.set("generator", "search")
        commonsUrl.searchParams.set("gsrnamespace", "6")
        commonsUrl.searchParams.set("gsrlimit", "8")
        commonsUrl.searchParams.set("gsrsearch", query)
        commonsUrl.searchParams.set("prop", "imageinfo")
        commonsUrl.searchParams.set("iiprop", "url")
        commonsUrl.searchParams.set("iiurlwidth", "1600")

        const response = await fetch(commonsUrl, {
            headers: {
                "User-Agent": "Execra/1.0",
            },
            cache: "no-store",
        })

        if (!response.ok) {
            return NextResponse.redirect(buildFallbackUrl(query, Number.isNaN(slot) ? 0 : slot))
        }

        const data = await response.json() as WikimediaQueryResponse
        const pages = Object.values(data.query?.pages ?? {})
        const candidates = pages
            .map((page) => page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url ?? null)
            .filter((url): url is string => Boolean(url))

        if (candidates.length === 0) {
            return NextResponse.redirect(buildFallbackUrl(query, Number.isNaN(slot) ? 0 : slot))
        }

        const normalizedSlot = Number.isNaN(slot) ? 0 : Math.abs(slot)
        return NextResponse.redirect(candidates[normalizedSlot % candidates.length], {
            headers: {
                "Cache-Control": "no-store",
            },
        })
    } catch {
        return NextResponse.redirect(buildFallbackUrl(query, Number.isNaN(slot) ? 0 : slot))
    }
}

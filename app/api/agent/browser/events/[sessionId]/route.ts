import { subscribeToBrowserSession } from "@/lib/services/browserSessionStore"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toSsePayload(data: unknown) {
    return `data: ${JSON.stringify(data)}\n\n`
}

export async function GET(
    _req: Request,
    context: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await context.params
    let cleanup = () => undefined

    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder()
            const unsubscribe = subscribeToBrowserSession(sessionId, (message) => {
                controller.enqueue(encoder.encode(toSsePayload(message)))
            })

            controller.enqueue(encoder.encode("retry: 1000\n\n"))

            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(": heartbeat\n\n"))
            }, 15000)

            cleanup = () => {
                clearInterval(heartbeat)
                unsubscribe()
            }
        },
        cancel() {
            cleanup()
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    })
}

// Execra Platform
import { createServer } from "node:http"
import { parse } from "node:url"
import express from "express"
import next from "next"

const dev = process.env.NODE_ENV !== "production"
const port = Number(process.env.PORT || 3001)
const app = next({ dev, hostname: "0.0.0.0", port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
    const upgradeHandler = app.getUpgradeHandler()
    const server = express()

    server.all(/.*/, (req, res) => handle(req, res))

    const httpServer = createServer(server)

    // Delegate WebSocket upgrade requests (HMR / Turbopack) to Next.js
    httpServer.on("upgrade", (req, socket, head) => {
        try {
            upgradeHandler(req, socket, head)
        } catch (err) {
            console.error("[server] Upgrade handler error:", err)
            socket.destroy()
        }
    })

    httpServer.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`)
    })
})


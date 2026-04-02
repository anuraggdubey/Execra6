import express from "express"
import next from "next"

const dev = process.env.NODE_ENV !== "production"
const port = Number(process.env.PORT || 3001)
const app = next({ dev, hostname: "0.0.0.0", port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
    const server = express()

    server.all(/.*/, (req, res) => handle(req, res))

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`)
    })
})

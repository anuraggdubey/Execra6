import { spawnSync } from "node:child_process"

const runner = process.platform === "win32" ? "npx.cmd" : "npx"
const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: "0",
}

const result = spawnSync(runner, ["playwright", "install", "chromium"], {
    stdio: "inherit",
    env,
})

if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status)
}

if (result.error) {
    throw result.error
}

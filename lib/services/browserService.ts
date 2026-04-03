import path from "node:path"
import { promises as fs } from "node:fs"
import { chromium, type Page } from "playwright"
import { AgentExecutionError } from "@/lib/agents/shared"
import type { BrowserAutomationAction } from "@/lib/services/automationPlanner"
import type { ExecutedBrowserStep } from "@/lib/services/browserSessionStore"

const STEP_TIMEOUT_MS = 15_000
const RUN_TIMEOUT_MS = 120_000
const POST_ACTION_WAIT_MS = 1200
const VISIBLE_COMPLETION_DELAY_MS = 2500

function isPrivateOrRestrictedHost(hostname: string) {
    const normalized = hostname.toLowerCase()
    return (
        normalized === "localhost" ||
        normalized === "127.0.0.1" ||
        normalized === "::1" ||
        normalized.endsWith(".local") ||
        normalized.startsWith("10.") ||
        normalized.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    )
}

function validateUrl(url: string) {
    let parsed: URL

    try {
        parsed = new URL(url)
    } catch {
        throw new AgentExecutionError("INVALID_URL", `Invalid URL: ${url}`, 400)
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new AgentExecutionError("UNSAFE_TARGET", "Only http and https URLs are allowed for browser automation.", 400)
    }

    if (isPrivateOrRestrictedHost(parsed.hostname)) {
        throw new AgentExecutionError("UNSAFE_TARGET", "Local, private, and restricted hosts are blocked for browser automation.", 403)
    }

    return parsed.toString()
}

async function ensureScreenshotDir() {
    const dir = path.join(process.cwd(), "public", "browser-agent")
    await fs.mkdir(dir, { recursive: true })
    return dir
}

async function waitForSettledPage(page: Page) {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined)
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined)
}

function selectorLabel(selector: string) {
    return selector.length > 80 ? `${selector.slice(0, 77)}...` : selector
}

async function resolveSelector(page: Page, selector: string) {
    const trimmed = selector.trim()
    const candidates = [
        page.locator(trimmed),
    ]

    if (!trimmed.includes("#") && !trimmed.includes(".") && !trimmed.includes("[") && !trimmed.includes(">")) {
        candidates.push(
            page.getByLabel(trimmed, { exact: false }),
            page.getByPlaceholder(trimmed, { exact: false }),
            page.getByRole("button", { name: trimmed, exact: false }),
            page.getByRole("link", { name: trimmed, exact: false }),
            page.getByText(trimmed, { exact: false })
        )
    }

    for (const locator of candidates) {
        const count = await locator.count().catch(() => 0)
        if (count > 0) {
            return locator.first()
        }
    }

    return page.locator(trimmed).first()
}

export async function executeBrowserPlan(params: {
    steps: BrowserAutomationAction[]
    onLog: (message: string, level?: "info" | "success" | "error") => void
}) {
    const browser = await chromium.launch({
        headless: false,
        slowMo: 150,
    })

    const context = await browser.newContext()
    const page = await context.newPage()
    const executedSteps: ExecutedBrowserStep[] = []
    const extractedParts: string[] = []
    const screenshotDir = await ensureScreenshotDir()
    const startedAt = Date.now()

    try {
        await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined)

        for (let index = 0; index < params.steps.length; index++) {
            if (Date.now() - startedAt > RUN_TIMEOUT_MS) {
                throw new AgentExecutionError("BROWSER_TIMEOUT", "Browser automation timed out before completion.", 504)
            }

            const step = params.steps[index]
            const prefix = `Step ${index + 1}/${params.steps.length}`

            if (step.action === "goto") {
                const url = validateUrl(step.url)
                params.onLog(`${prefix}: Opening ${url}`)
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS })
                await waitForSettledPage(page)
                executedSteps.push({ action: step.action, status: "completed", detail: `Opened ${url}` })
                continue
            }

            if (step.action === "waitForSelector") {
                params.onLog(`${prefix}: Waiting for ${selectorLabel(step.selector)}`)
                const locator = await resolveSelector(page, step.selector)
                await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
                executedSteps.push({ action: step.action, status: "completed", detail: `Found ${selectorLabel(step.selector)}` })
                continue
            }

            if (step.action === "click") {
                params.onLog(`${prefix}: Clicking ${selectorLabel(step.selector)}`)
                const locator = await resolveSelector(page, step.selector)
                await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
                await locator.click({ timeout: STEP_TIMEOUT_MS })
                await page.waitForTimeout(POST_ACTION_WAIT_MS)
                await waitForSettledPage(page)
                executedSteps.push({ action: step.action, status: "completed", detail: `Clicked ${selectorLabel(step.selector)}` })
                continue
            }

            if (step.action === "type") {
                params.onLog(`${prefix}: Typing into ${selectorLabel(step.selector)}`)
                const locator = await resolveSelector(page, step.selector)
                await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
                await locator.fill(step.value, { timeout: STEP_TIMEOUT_MS })
                executedSteps.push({ action: step.action, status: "completed", detail: `Typed into ${selectorLabel(step.selector)}` })
                continue
            }

            if (step.action === "press") {
                params.onLog(`${prefix}: Pressing ${step.key}`)
                await page.keyboard.press(step.key)
                await page.waitForTimeout(POST_ACTION_WAIT_MS)
                await waitForSettledPage(page)
                executedSteps.push({ action: step.action, status: "completed", detail: `Pressed ${step.key}` })
                continue
            }

            if (step.action === "extractText") {
                params.onLog(`${prefix}: Extracting text from ${selectorLabel(step.selector)}`)
                const locator = await resolveSelector(page, step.selector)
                await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
                const extractedText = (await locator.innerText({ timeout: STEP_TIMEOUT_MS })).trim()
                extractedParts.push(step.label ? `${step.label}: ${extractedText}` : extractedText)
                executedSteps.push({
                    action: step.action,
                    status: "completed",
                    detail: `Extracted text from ${selectorLabel(step.selector)}`,
                    extractedText,
                })
                continue
            }

            if (step.action === "screenshot") {
                const fileName = `${Date.now()}-${(step.name ?? "screenshot").replace(/[^a-z0-9-_]+/gi, "-")}.png`
                const screenshotPath = path.join(screenshotDir, fileName)
                const screenshotUrl = `/browser-agent/${fileName}`
                params.onLog(`${prefix}: Capturing screenshot`)
                await page.waitForTimeout(1000)
                await page.screenshot({ path: screenshotPath, fullPage: true, timeout: STEP_TIMEOUT_MS })
                executedSteps.push({
                    action: step.action,
                    status: "completed",
                    detail: "Captured screenshot",
                    screenshotPath,
                    screenshotUrl,
                })
                continue
            }
        }

        params.onLog("Browser automation completed successfully.", "success")
        await page.waitForTimeout(VISIBLE_COMPLETION_DELAY_MS)
        return {
            stepsExecuted: executedSteps,
            result: extractedParts.join("\n\n") || "Browser automation completed without text extraction.",
            finalUrl: page.url(),
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Browser automation failed"
        const failedStep = params.steps[executedSteps.length]
        if (failedStep) {
            executedSteps.push({
                action: failedStep.action,
                status: "failed",
                detail: message,
            })
        }
        params.onLog(message, "error")
        throw new AgentExecutionError("BROWSER_EXECUTION_FAILED", message, 502, { stepsExecuted: executedSteps })
    } finally {
        await context.close().catch(() => undefined)
        await browser.close().catch(() => undefined)
    }
}

import { chromium, type Page } from "playwright"
import { AgentExecutionError } from "@/lib/agents/shared"
import type { BrowserAutomationAction } from "@/lib/services/automationPlanner"
import type { ExecutedBrowserStep } from "@/lib/services/browserSessionStore"

const STEP_TIMEOUT_MS = 15_000
const RUN_TIMEOUT_MS = 120_000
const POST_ACTION_WAIT_MS = 1200
const VISIBLE_COMPLETION_DELAY_MS = 2500

function resolveHeadlessMode() {
    const configured = process.env.PLAYWRIGHT_HEADLESS?.trim().toLowerCase()
    if (configured === "false") return false
    if (configured === "true") return true
    return process.env.NODE_ENV === "production"
}

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

async function waitForSettledPage(page: Page) {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined)
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined)
}

function selectorLabel(selector: string) {
    return selector.length > 80 ? `${selector.slice(0, 77)}...` : selector
}

async function extractVisibleTextFromSelector(page: Page, selector: string) {
    const selectors = selector
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)

    for (const candidate of selectors) {
        if (candidate === "title") {
            const title = (await page.title().catch(() => "")).trim()
            if (title) return title
            continue
        }

        const locator = await resolveSelector(page, candidate)
        const count = await locator.count().catch(() => 0)
        if (count === 0) continue

        const first = locator.first()
        const isVisible = await first.isVisible().catch(() => false)
        if (!isVisible) continue

        const text = (await first.innerText({ timeout: STEP_TIMEOUT_MS }).catch(() => "")).trim()
        if (text) return text
    }

    const fallbackText = await page.evaluate(() => {
        const mainLike = document.querySelector("main, article, [role='main']")
        const bodyText = (mainLike?.textContent ?? document.body?.innerText ?? "").trim()
        return bodyText || document.title || ""
    }).catch(() => "")

    return fallbackText.trim()
}

async function extractFormSummary(page: Page) {
    return page.evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim()
        const title = normalize(document.title)
        const headings = Array.from(document.querySelectorAll("h1, h2, [role='heading']"))
            .map((node) => normalize(node.textContent))
            .filter(Boolean)

        const fields = Array.from(document.querySelectorAll("input, textarea, select"))
            .map((element) => {
                const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                const labelFromAria = normalize(input.getAttribute("aria-label"))
                const labelFromPlaceholder = normalize("placeholder" in input ? input.placeholder : "")
                const labelFromName = normalize(input.getAttribute("name"))
                const tagName = input.tagName.toLowerCase()
                const type = "type" in input ? normalize((input as HTMLInputElement).type) || tagName : tagName
                const required = input.hasAttribute("required") || normalize(input.getAttribute("aria-required")) === "true"

                return {
                    label: labelFromAria || labelFromPlaceholder || labelFromName || type || "field",
                    type,
                    required,
                }
            })
            .filter((field) => field.label)

        const questionBlocks = Array.from(document.querySelectorAll("[role='listitem'], [data-params], .Qr7Oae"))
            .map((node) => normalize((node as HTMLElement).innerText))
            .filter((text) => text && text.length < 400)
            .slice(0, 12)

        return {
            title,
            headings: headings.slice(0, 6),
            fields: fields.slice(0, 20),
            questions: questionBlocks,
        }
    }).catch(() => null)
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
        headless: resolveHeadlessMode(),
        slowMo: 150,
    })

    const context = await browser.newContext()
    const page = await context.newPage()
    const executedSteps: ExecutedBrowserStep[] = []
    const extractedParts: string[] = []
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
                const extractedText = await extractVisibleTextFromSelector(page, step.selector)
                if (!extractedText) {
                    throw new AgentExecutionError("EXTRACTION_FAILED", `Could not extract visible text from ${selectorLabel(step.selector)}`, 422)
                }

                const formSummary = await extractFormSummary(page)
                const formText = formSummary && (formSummary.fields.length > 0 || formSummary.questions.length > 0)
                    ? [
                        formSummary.title ? `Form title: ${formSummary.title}` : "",
                        formSummary.headings.length > 0 ? `Headings: ${formSummary.headings.join(" | ")}` : "",
                        formSummary.questions.length > 0 ? `Possible questions:\n- ${formSummary.questions.join("\n- ")}` : "",
                        formSummary.fields.length > 0
                            ? `Detected fields:\n- ${formSummary.fields.map((field) => `${field.label}${field.required ? " (required)" : ""} [${field.type}]`).join("\n- ")}`
                            : "",
                    ].filter(Boolean).join("\n\n")
                    : ""

                const combinedText = formText ? `${extractedText}\n\n${formText}` : extractedText
                extractedParts.push(step.label ? `${step.label}: ${extractedText}` : extractedText)
                executedSteps.push({
                    action: step.action,
                    status: "completed",
                    detail: `Extracted text from ${selectorLabel(step.selector)}`,
                    extractedText: combinedText,
                })
                continue
            }

        }

        params.onLog("Browser automation completed successfully.", "success")
        await page.waitForTimeout(VISIBLE_COMPLETION_DELAY_MS)
        return {
            stepsExecuted: executedSteps,
            result: executedSteps
                .map((step) => step.extractedText)
                .filter((value): value is string => Boolean(value))
                .join("\n\n")
                || extractedParts.join("\n\n")
                || "Browser automation completed without text extraction.",
            finalUrl: page.url(),
        }
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "Browser automation failed"
        const message = /Executable doesn't exist/i.test(rawMessage)
            ? "Chromium is not installed in the deployment runtime. Ensure Playwright browsers are installed during build."
            : rawMessage
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

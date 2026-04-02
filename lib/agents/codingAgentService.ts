import { completeWithOpenRouter } from "@/lib/llm/openrouter"
import { AgentExecutionError, createLlmError } from "@/lib/agents/shared"
import { fileTool } from "@/lib/tools/fileTool"
import { previewTool } from "@/lib/tools/previewTool"

export interface ProjectFiles {
    html: string
    css: string
    js: string
}

const PREMIUM_BASELINE_CSS = `
:root {
    --bg: #07111f;
    --bg-soft: #0d1b2f;
    --panel: rgba(11, 23, 40, 0.78);
    --panel-strong: rgba(15, 31, 52, 0.96);
    --border: rgba(148, 163, 184, 0.18);
    --text: #f8fafc;
    --muted: #a8b6cc;
    --primary: #5eead4;
    --secondary: #60a5fa;
    --accent: #f59e0b;
    --shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    --radius: 24px;
    --radius-sm: 16px;
    --container: min(1180px, calc(100vw - 32px));
    --font-display: "Sora", "Poppins", "Segoe UI", sans-serif;
    --font-body: "Inter", "Segoe UI", sans-serif;
}

*,
*::before,
*::after {
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
}

body {
    margin: 0;
    min-height: 100vh;
    font-family: var(--font-body);
    color: var(--text);
    background:
        radial-gradient(circle at top left, rgba(96, 165, 250, 0.25), transparent 30%),
        radial-gradient(circle at top right, rgba(94, 234, 212, 0.18), transparent 25%),
        linear-gradient(180deg, #07111f 0%, #0b1324 42%, #050913 100%);
    line-height: 1.6;
}

body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: radial-gradient(circle at center, black 28%, transparent 86%);
    opacity: 0.35;
}

a {
    color: inherit;
    text-decoration: none;
}

img {
    display: block;
    max-width: 100%;
}

button,
.button,
input[type="submit"] {
    border: 0;
    cursor: pointer;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    color: #04111f;
    font-weight: 700;
    padding: 0.9rem 1.35rem;
    box-shadow: 0 14px 30px rgba(45, 212, 191, 0.22);
    transition: transform 220ms ease, box-shadow 220ms ease, filter 220ms ease;
}

button:hover,
.button:hover,
input[type="submit"]:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 40px rgba(96, 165, 250, 0.28);
    filter: saturate(1.08);
}

input,
textarea,
select {
    font: inherit;
}

body > header,
body > nav,
header:first-of-type {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(18px);
    background: rgba(7, 17, 31, 0.75);
    border-bottom: 1px solid var(--border);
}

header > *,
nav > *,
main > *,
footer > *,
section > * {
    width: var(--container);
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
}

header,
nav,
main,
footer,
section {
    position: relative;
}

main,
section,
footer {
    padding: 32px 0;
}

h1, h2, h3, h4 {
    margin: 0 0 0.9rem;
    font-family: var(--font-display);
    line-height: 1.05;
    letter-spacing: -0.04em;
}

h1 {
    font-size: clamp(3rem, 7vw, 6rem);
    max-width: 12ch;
}

h2 {
    font-size: clamp(2rem, 4vw, 3.4rem);
}

h3 {
    font-size: clamp(1.2rem, 2vw, 1.65rem);
}

p,
li,
span,
label {
    color: var(--muted);
    font-size: 1rem;
}

header ul,
nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    list-style: none;
    margin: 0;
    padding: 18px 0;
    align-items: center;
}

header li a,
nav li a {
    padding: 0.7rem 1rem;
    border-radius: 999px;
    color: var(--text);
    transition: background 220ms ease, transform 220ms ease, color 220ms ease;
}

header li a:hover,
nav li a:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    color: white;
}

main > section,
body > section,
article,
.card,
.panel,
.feature,
.pricing-card,
.stat,
.tile {
    background: linear-gradient(180deg, rgba(18, 33, 54, 0.92), rgba(9, 20, 35, 0.88));
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
}

main > section,
body > section {
    padding: 30px;
    margin-bottom: 24px;
    overflow: hidden;
}

main > section:first-of-type,
body > section:first-of-type {
    min-height: min(78vh, 880px);
    display: grid;
    align-items: center;
}

section ul:not(header ul):not(nav ul) {
    list-style: none;
    display: grid;
    gap: 16px;
    padding: 0;
    margin: 0;
}

section li:not(header li):not(nav li),
article,
.card,
.feature,
.pricing-card,
.tile {
    padding: 20px;
    border-radius: var(--radius-sm);
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    transition: transform 220ms ease, border-color 220ms ease, background 220ms ease;
}

section li:not(header li):not(nav li):hover,
article:hover,
.card:hover,
.feature:hover,
.pricing-card:hover,
.tile:hover {
    transform: translateY(-4px);
    border-color: rgba(94, 234, 212, 0.35);
    background: rgba(255,255,255,0.05);
}

main > section:first-of-type::before,
body > section:first-of-type::before {
    content: "";
    position: absolute;
    inset: auto -10% -20% auto;
    width: 360px;
    height: 360px;
    background: radial-gradient(circle, rgba(94, 234, 212, 0.24), transparent 68%);
    filter: blur(12px);
    animation: floatGlow 9s ease-in-out infinite;
}

[data-animate] {
    opacity: 0;
    transform: translateY(24px) scale(0.985);
    transition: opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
}

body.is-ready [data-animate] {
    opacity: 1;
    transform: translateY(0) scale(1);
}

[data-animate="delay-1"] { transition-delay: 80ms; }
[data-animate="delay-2"] { transition-delay: 160ms; }
[data-animate="delay-3"] { transition-delay: 240ms; }
[data-animate="delay-4"] { transition-delay: 320ms; }

@keyframes floatGlow {
    0%, 100% { transform: translateY(0px) scale(1); }
    50% { transform: translateY(-18px) scale(1.05); }
}

@media (max-width: 900px) {
    body > header,
    body > nav,
    header:first-of-type {
        position: static;
    }

    main > section,
    body > section {
        padding: 22px;
    }

    h1 {
        font-size: clamp(2.35rem, 12vw, 4rem);
    }
}
`.trim()

const PREMIUM_BASELINE_JS = `
document.addEventListener("DOMContentLoaded", () => {
    const animated = Array.from(document.querySelectorAll("section, article, .card, .feature, .tile, .pricing-card, li"))
    animated.slice(0, 16).forEach((node, index) => {
        if (!node.hasAttribute("data-animate")) {
            node.setAttribute("data-animate", \`delay-\${Math.min((index % 4) + 1, 4)}\`)
        }
    })

    const activate = () => document.body.classList.add("is-ready")
    window.setTimeout(activate, 80)

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible")
            }
        })
    }, { threshold: 0.14 })

    document.querySelectorAll("[data-animate]").forEach((node) => observer.observe(node))

    document.querySelectorAll("a[href^='#']").forEach((link) => {
        link.addEventListener("click", (event) => {
            const href = link.getAttribute("href")
            if (!href || href === "#") return
            const target = document.querySelector(href)
            if (!target) return
            event.preventDefault()
            target.scrollIntoView({ behavior: "smooth", block: "start" })
        })
    })
})
`.trim()

const CODING_AGENT_SYSTEM_PROMPT = `You are a senior product engineer and visual frontend designer who only returns project code.

Your job is to generate polished, advanced UI by default, not wireframes or classroom-demo layouts.

Quality bar:
- Build interfaces that feel premium, modern, and intentionally designed.
- Avoid barebones outputs, oversized empty areas, default browser styling, and toy-app layouts.
- Use strong hierarchy, spacing, contrast, and composition.
- Include enough content density that the preview looks complete on first load.
- Prefer rich dashboards, real-looking panels, meaningful navigation, charts, tables, filters, and status areas when the prompt asks for admin, analytics, SaaS, workspace, or dashboard UI.
- Use tasteful gradients, layered surfaces, hover states, transitions, and responsive layouts.
- Make the result look like a product someone would actually ship.
- Focus heavily on UI styling, layout polish, and interaction quality.

Implementation requirements:
1. Return exactly three files using markdown fences named index.html, style.css, and script.js.
2. Generate complete, working code only.
3. Do not describe how to save files or preview files.
4. index.html must reference style.css and script.js with relative paths.
5. Keep the project self-contained with no build step.
6. CSS must be substantial and custom, with design tokens in :root, responsive breakpoints, hover states, and clear component styling.
7. JavaScript must add meaningful interactivity or animation where appropriate.
8. Never leave TODOs, placeholders, or comments saying something should be added later.
9. Never produce a plain document with a few boxes and labels. The first render should already look impressive.
10. Never rely on default browser styles.

Dashboard-specific expectations:
- Include a sidebar or top navigation, summary KPI cards, at least one rich chart or analytics section, a secondary data view such as table/activity/feed, and supporting controls.
- Use realistic sample labels and values so the preview feels believable.
- Organize dashboard content in dense grids instead of long single-column stacking.

Code requirements:
- Use semantic HTML.
- Use accessible labels and button text.
- Keep JavaScript framework-free and browser-ready.
- Ensure the layout works on desktop and mobile.
- Prefer refined typography, card systems, rounded corners, layered panels, and polished states over novelty gimmicks.
- Include subtle premium motion such as reveal animations, hover transitions, and ambient accents.`

function buildCodingUserPrompt(prompt: string) {
    const loweredPrompt = prompt.toLowerCase()
    const isDashboardPrompt =
        loweredPrompt.includes("dashboard") ||
        loweredPrompt.includes("admin") ||
        loweredPrompt.includes("analytics") ||
        loweredPrompt.includes("analyzer") ||
        loweredPrompt.includes("saas")

    const isStockPrompt =
        loweredPrompt.includes("stock") ||
        loweredPrompt.includes("market") ||
        loweredPrompt.includes("trading") ||
        loweredPrompt.includes("portfolio")

    const specializedRequirements = [
        isDashboardPrompt ? `Dashboard-specific execution requirements:
- Use a true dashboard layout with a styled sidebar navigation and a top utility/search area.
- Show core metrics in polished stat cards with strong hierarchy and contrasting accent colors.
- Include at least one larger analytics section and one secondary data section such as watchlist, movers, activity feed, screener table, or insights panel.
- Use CSS Grid or Flexbox for all main layout regions.
- Make the dashboard feel like a real SaaS product, not a landing page.` : null,
        isStockPrompt ? `Stock and market-specific execution requirements:
- Present sections such as market value, top gainers, top losers, total volume, watchlist, market sentiment, or sector performance.
- Style search and filter controls carefully with generous padding, clear focus states, and premium form styling.
- Use believable stock-style labels, tickers, percentages, and trend indicators.
- Favor a dark finance-dashboard aesthetic unless the user explicitly asks for a light theme.` : null,
        `Non-negotiable styling requirements:
- Do not return a raw document look.
- Use rounded cards, shadows, layered surfaces, polished hover states, and modern typography.
- Ensure the first screen already looks designed before any interaction.
- Include subtle but visible motion such as hover transitions, reveal effects, and panel emphasis.`,
    ].filter(Boolean).join("\n\n")

    return `Build this project.

User request:
${prompt}

Default quality expectations:
- Make it visually advanced and product-grade.
- Add rich structure, not a minimal mockup.
- Focus on design quality through typography, spacing, color, surfaces, navigation, and component systems.
- If the request is for a dashboard, admin panel, analytics page, workspace, or SaaS UI, make it dense, polished, and interactive by default.
- Ensure the CSS is visibly reflected in the preview and not just present as unused code.
- Build in premium-feeling animation by default: page-load reveals, section transitions, button/card hover states, animated accents, and polished motion timing.

${specializedRequirements}

Return only the three required files.`
}

function ensureDocumentShell(html: string) {
    let next = html.trim()

    if (!/^<!doctype html>/i.test(next)) {
        next = `<!DOCTYPE html>\n${next}`
    }

    if (!/<html[\s>]/i.test(next)) {
        next = `<html lang="en">\n${next}\n</html>`
    }

    if (!/<body[\s>]/i.test(next)) {
        next = next.replace(/<\/html>/i, "<body>\n</body>\n</html>")
    }

    return next
}

function injectIntoHead(html: string, snippet: string) {
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${snippet}\n</head>`)
    }

    if (/<body[^>]*>/i.test(html)) {
        return html.replace(/<body[^>]*>/i, `<head>\n${snippet}\n</head>\n$&`)
    }

    return `${snippet}\n${html}`
}

function injectBeforeBodyEnd(html: string, snippet: string) {
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${snippet}\n</body>`)
    }

    return `${html}\n${snippet}`
}

function normalizeHtml(html: string) {
    let next = ensureDocumentShell(html)

    if (!/<meta[^>]+name=["']viewport["']/i.test(next)) {
        next = injectIntoHead(next, `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`)
    }

    if (!/<link[^>]+href=["'][^"']*style\.css["']/i.test(next)) {
        next = injectIntoHead(next, `<link rel="stylesheet" href="style.css" />`)
    }

    if (!/<script[^>]+src=["'][^"']*script\.js["']/i.test(next)) {
        next = injectBeforeBodyEnd(next, `<script src="script.js"></script>`)
    }

    return next
        .replace(/<base[^>]*\/?>/gi, "")
        .replace(/href=["']\/?\.?\/?(styles?|main|app|global)?style\.css["']/gi, `href="style.css"`)
        .replace(/src=["']\/?\.?\/?(main|app|index)?script\.js["']/gi, `src="script.js"`)
        .replace(/href=["'][^"']*(styles?|main|app|global)\.css["']/gi, `href="style.css"`)
        .replace(/src=["'][^"']*(main|app|index)\.js["']/gi, `src="script.js"`)
}

function addAnimationMarkers(html: string) {
    let sequence = 0

    return html.replace(/<(section|article|li|div)([^>]*?)>/gi, (full, tag, attrs) => {
        if (/data-animate=/i.test(attrs)) return full
        if (tag.toLowerCase() === "div" && !/class=/i.test(attrs)) return full

        sequence += 1
        const delay = `delay-${Math.min(((sequence - 1) % 4) + 1, 4)}`
        return `<${tag}${attrs} data-animate="${delay}">`
    })
}

function normalizeProjectFiles(files: ProjectFiles): ProjectFiles {
    return {
        html: addAnimationMarkers(normalizeHtml(files.html)),
        css: `${PREMIUM_BASELINE_CSS}\n\n/* Existing generated CSS */\n${files.css.trim()}`,
        js: `${PREMIUM_BASELINE_JS}\n\n// Existing generated JS\n${files.js.trim()}`,
    }
}

function collectProjectQualityIssues(files: ProjectFiles) {
    const issues: string[] = []

    if (!/<link[^>]+href=["'][^"']*style\.css["']/i.test(files.html)) {
        issues.push("index.html is not clearly linking style.css")
    }

    if (!/<script[^>]+src=["'][^"']*script\.js["']/i.test(files.html)) {
        issues.push("index.html is not clearly loading script.js")
    }

    if (files.css.length < 1800) {
        issues.push("style.css is too small to support a premium UI")
    }

    if (!/:root\s*{/i.test(files.css)) {
        issues.push("style.css is missing design tokens in :root")
    }

    if (!/@media/i.test(files.css)) {
        issues.push("style.css is missing responsive breakpoints")
    }

    if (!/(transition|animation|@keyframes)/i.test(files.css)) {
        issues.push("style.css is missing meaningful animation or transitions")
    }

    if (!/(IntersectionObserver|requestAnimationFrame|classList\.add|addEventListener)/i.test(files.js)) {
        issues.push("script.js is missing meaningful UI behavior or animation hooks")
    }

    if (!/(section|nav|main|aside|header|footer)/i.test(files.html)) {
        issues.push("index.html lacks the structure expected from a polished product UI")
    }

    return issues
}

function collectPromptSpecificQualityIssues(prompt: string, files: ProjectFiles) {
    const issues: string[] = []
    const loweredPrompt = prompt.toLowerCase()

    const isDashboardPrompt =
        loweredPrompt.includes("dashboard") ||
        loweredPrompt.includes("admin") ||
        loweredPrompt.includes("analytics") ||
        loweredPrompt.includes("analyzer") ||
        loweredPrompt.includes("saas")

    const isStockPrompt =
        loweredPrompt.includes("stock") ||
        loweredPrompt.includes("market") ||
        loweredPrompt.includes("trading") ||
        loweredPrompt.includes("portfolio")

    if (isDashboardPrompt && !/(sidebar|sidenav|side-nav|nav)/i.test(files.html)) {
        issues.push("dashboard output is missing a clear sidebar-style navigation")
    }

    if (isDashboardPrompt) {
        const statSignals = (files.html.match(/market value|gainers|losers|volume|watchlist|stat|metric|card/gi) ?? []).length
        if (statSignals < 4) {
            issues.push("dashboard output is missing enough stat-card or market-metric content")
        }

        if (!/(grid-template|display:\s*grid|display:\s*flex)/i.test(files.css)) {
            issues.push("dashboard CSS is not using strong grid or flex layout patterns")
        }
    }

    if (isStockPrompt && !/(search|input)/i.test(files.html)) {
        issues.push("stock analyzer output is missing a styled search or filter control")
    }

    if (isStockPrompt && !/(ticker|market value|gainers|losers|volume|portfolio|watchlist)/i.test(files.html)) {
        issues.push("stock analyzer output is not presenting stock-specific dashboard content")
    }

    return issues
}

function serializeProjectFiles(files: ProjectFiles) {
    return [
        `\`\`\`index.html\n${files.html}\n\`\`\``,
        `\`\`\`style.css\n${files.css}\n\`\`\``,
        `\`\`\`script.js\n${files.js}\n\`\`\``,
    ].join("\n\n")
}

async function repairProjectFiles(prompt: string, files: ProjectFiles, issues: string[]) {
    try {
        return await completeWithOpenRouter({
            system: CODING_AGENT_SYSTEM_PROMPT,
            user: `The previous project output was not strong enough. Repair it into a premium, highly styled, animated result.

Original user request:
${prompt}

Problems to fix:
${issues.map((issue) => `- ${issue}`).join("\n")}

Repair requirements:
- Keep the project self-contained and previewable.
- Keep or improve the existing information architecture, but dramatically upgrade the visual design.
- Ensure style.css is clearly used by index.html.
- Add premium-feeling motion with intentional, high-end animation.
- Make the first screen feel shippable, not like plain HTML.
- Return only the three required files.

Previous output:
${serializeProjectFiles(files)}`,
            maxTokens: 8000,
            temperature: 0.7,
        })
    } catch (error) {
        throw createLlmError(error, "Coding generation repair failed")
    }
}

export function parseAgentOutput(text: string): ProjectFiles {
    const htmlMatch = text.match(/```(?:index\.html|html)\s*([\s\S]*?)```/i)
    const cssMatch = text.match(/```(?:style\.css|css)\s*([\s\S]*?)```/i)
    const jsMatch = text.match(/```(?:script\.js|javascript|js)\s*([\s\S]*?)```/i)

    const html = htmlMatch?.[1]?.trim()
    const css = cssMatch?.[1]?.trim()
    const js = jsMatch?.[1]?.trim()

    if (!html || css === undefined || js === undefined) {
        throw new AgentExecutionError(
            "INVALID_LLM_OUTPUT",
            "Coding agent did not return the required file structure",
            502
        )
    }

    return { html, css, js }
}

const LANGUAGE_LABELS: Record<string, string> = {
    "html-css-js": "HTML / CSS / JS",
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    react: "React (JSX/TSX)",
    java: "Java",
    cpp: "C++",
    go: "Go",
    rust: "Rust",
    swift: "Swift",
    ruby: "Ruby",
    php: "PHP",
}

const SINGLE_FILE_SYSTEM_PROMPT = (lang: string) => `You are a senior software engineer.

Your job is to generate clean, idiomatic, production-quality ${lang} code.

Rules:
1. Return a SINGLE fenced code block with the complete source file.
2. The code must be complete, runnable, and well-structured.
3. Include proper imports/includes at the top.
4. Add clear inline comments for complex logic.
5. Use modern language features and best practices.
6. Never leave TODOs, placeholders, or incomplete sections.
7. If the request involves a CLI tool, include argument parsing.
8. If the request involves a web server, include routing and response handling.
9. Make the code substantial and impressive, not a minimal stub.
10. Output ONLY the code block, no explanations before or after.`

export function parseSingleFileOutput(text: string, language: string): { code: string; filename: string } {
    const match = text.match(/```(?:\w+)?\s*([\s\S]*?)```/)
    const code = match?.[1]?.trim()

    if (!code) {
        throw new AgentExecutionError("INVALID_LLM_OUTPUT", "Coding agent did not return a code block", 502)
    }

    const extensions: Record<string, string> = {
        python: "main.py",
        javascript: "index.js",
        typescript: "index.ts",
        react: "App.tsx",
        java: "Main.java",
        cpp: "main.cpp",
        go: "main.go",
        rust: "main.rs",
        swift: "main.swift",
        ruby: "main.rb",
        php: "index.php",
    }

    return { code, filename: extensions[language] ?? "main.txt" }
}

export async function runCodingAgent(prompt: string, language?: string) {
    const lang = language && language !== "html-css-js" ? language : null

    if (!lang) {
        let raw: string
        try {
            raw = await completeWithOpenRouter({
                system: CODING_AGENT_SYSTEM_PROMPT,
                user: buildCodingUserPrompt(prompt),
                maxTokens: 8000,
                temperature: 0.7,
            })
        } catch (error) {
            throw createLlmError(error, "Coding generation failed")
        }

        let files = normalizeProjectFiles(parseAgentOutput(raw))
        const issues = [
            ...collectProjectQualityIssues(files),
            ...collectPromptSpecificQualityIssues(prompt, files),
        ]

        if (issues.length > 0) {
            raw = await repairProjectFiles(prompt, files, issues)
            files = normalizeProjectFiles(parseAgentOutput(raw))
        }

        const projectId = `project-${Date.now()}`
        await fileTool(projectId, [
            { name: "index.html", content: files.html },
            { name: "style.css", content: files.css },
            { name: "script.js", content: files.js },
        ])

        return {
            projectId,
            files,
            raw,
            preview: previewTool(projectId),
            language: "html-css-js",
        }
    }

    const langLabel = LANGUAGE_LABELS[lang] ?? lang
    let raw: string
    try {
        raw = await completeWithOpenRouter({
            system: SINGLE_FILE_SYSTEM_PROMPT(langLabel),
            user: `Write ${langLabel} code for this task:\n\n${prompt}`,
            maxTokens: 8000,
            temperature: 0.7,
        })
    } catch (error) {
        throw createLlmError(error, "Coding generation failed")
    }

    const { code, filename } = parseSingleFileOutput(raw, lang)
    const projectId = `project-${Date.now()}`
    await fileTool(projectId, [{ name: filename, content: code }])

    return {
        projectId,
        files: null,
        singleFile: { code, filename, language: lang },
        raw,
        preview: null,
        language: lang,
    }
}

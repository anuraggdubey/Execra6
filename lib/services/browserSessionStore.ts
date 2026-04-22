type SessionMessage =
    | { type: "connected"; sessionId: string; timestamp: string }
    | { type: "log"; sessionId: string; log: BrowserAgentLog }
    | { type: "done"; sessionId: string; result: BrowserAgentRunResult; timestamp: string }
    | { type: "error"; sessionId: string; error: string; timestamp: string }

export type BrowserAgentLog = {
    id: string
    level: "info" | "success" | "error"
    message: string
    timestamp: string
}

export type ExecutedBrowserStep = {
    action: string
    status: "completed" | "failed" | "skipped"
    detail: string
    extractedText?: string
    screenshotPath?: string
    screenshotUrl?: string
}

export type BrowserStructuredResult = {
    summary: string
    details: string
    keyPoints: string[]
    searchedQuery: string
    suggestions: string[]
}

export type BrowserAgentRunResult = {
    plannedSteps?: Array<{
        action: string
        detail: string
    }>
    stepsExecuted: ExecutedBrowserStep[]
    result: BrowserStructuredResult
    logs: BrowserAgentLog[]
}

type SessionState = {
    createdAt: number
    logs: BrowserAgentLog[]
    listeners: Set<(message: SessionMessage) => void>
    result: BrowserAgentRunResult | null
    error: string | null
}

const SESSION_TTL_MS = 30 * 60 * 1000

function getStore() {
    const globalScope = globalThis as typeof globalThis & {
        __browserAgentSessions?: Map<string, SessionState>
    }

    if (!globalScope.__browserAgentSessions) {
        globalScope.__browserAgentSessions = new Map<string, SessionState>()
    }

    return globalScope.__browserAgentSessions
}

function nowIso() {
    return new Date().toISOString()
}

function cleanupExpiredSessions() {
    const store = getStore()
    const cutoff = Date.now() - SESSION_TTL_MS

    for (const [sessionId, session] of store.entries()) {
        if (session.createdAt < cutoff && session.listeners.size === 0) {
            store.delete(sessionId)
        }
    }
}

function getOrCreateSession(sessionId: string) {
    cleanupExpiredSessions()

    const store = getStore()
    let session = store.get(sessionId)
    if (!session) {
        session = {
            createdAt: Date.now(),
            logs: [],
            listeners: new Set(),
            result: null,
            error: null,
        }
        store.set(sessionId, session)
    }

    return session
}

function emit(sessionId: string, message: SessionMessage) {
    const session = getOrCreateSession(sessionId)
    for (const listener of session.listeners) {
        listener(message)
    }
}

export function createBrowserSession(sessionId: string) {
    return getOrCreateSession(sessionId)
}

export function appendBrowserLog(sessionId: string, log: Omit<BrowserAgentLog, "id" | "timestamp">) {
    const session = getOrCreateSession(sessionId)
    const entry: BrowserAgentLog = {
        id: crypto.randomUUID(),
        timestamp: nowIso(),
        ...log,
    }

    session.logs.push(entry)
    emit(sessionId, { type: "log", sessionId, log: entry })
    return entry
}

export function completeBrowserSession(sessionId: string, result: Omit<BrowserAgentRunResult, "logs">) {
    const session = getOrCreateSession(sessionId)
    session.result = {
        ...result,
        logs: [...session.logs],
    }
    emit(sessionId, { type: "done", sessionId, result: session.result, timestamp: nowIso() })
    return session.result
}

export function failBrowserSession(sessionId: string, error: string) {
    const session = getOrCreateSession(sessionId)
    session.error = error
    emit(sessionId, { type: "error", sessionId, error, timestamp: nowIso() })
}

export function subscribeToBrowserSession(sessionId: string, listener: (message: SessionMessage) => void) {
    const session = getOrCreateSession(sessionId)
    session.listeners.add(listener)

    listener({ type: "connected", sessionId, timestamp: nowIso() })
    for (const log of session.logs) {
        listener({ type: "log", sessionId, log })
    }
    if (session.result) {
        listener({ type: "done", sessionId, result: session.result, timestamp: nowIso() })
    }
    if (session.error) {
        listener({ type: "error", sessionId, error: session.error, timestamp: nowIso() })
    }

    return () => {
        session.listeners.delete(listener)
    }
}

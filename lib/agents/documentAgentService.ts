import * as XLSX from "xlsx"
import { completeWithOpenRouter } from "@/lib/llm/openrouter"
import { AgentExecutionError, createLlmError } from "@/lib/agents/shared"

const MAX_CONTENT_CHARS = 18000

const DOCUMENT_ANALYSIS_SYSTEM_PROMPT = `You are a document analysis expert.

Your job is to analyze structured or unstructured document content and provide clear, useful insights.

RULES:
1. Summarize content clearly
2. Extract key points
3. Highlight important data
4. If data is tabular, identify patterns
5. Keep output structured and concise

OUTPUT FORMAT:

SUMMARY:

* Main overview

KEY INSIGHTS:

* Insight 1
* Insight 2

OPTIONAL:

* Data patterns or anomalies`

type SupportedDocumentType = "pdf" | "excel" | "csv" | "json" | "txt"

export type DocumentAnalysisInput = {
    fileName: string
    mimeType: string
    buffer: Buffer
    question?: string
}

export type DocumentAnalysisResult = {
    fileName: string
    fileType: SupportedDocumentType
    normalizedContent: string
    truncated: boolean
    analysis: string
}

export async function analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentAnalysisResult> {
    const fileType = detectDocumentType(input.fileName, input.mimeType)
    const normalized = await normalizeDocument(input.buffer, input.fileName, fileType)
    const truncated = normalized.length > MAX_CONTENT_CHARS
    const normalizedContent = truncated
        ? `${normalized.slice(0, MAX_CONTENT_CHARS)}\n\n[Content truncated to fit analysis limits.]`
        : normalized

    let analysis: string
    try {
        analysis = await completeWithOpenRouter({
            system: DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
            user: buildAnalysisPrompt({
                fileName: input.fileName,
                fileType,
                question: input.question,
                normalizedContent,
            }),
            maxTokens: 2200,
            temperature: 0.3,
        })
    } catch (error) {
        throw createLlmError(error, "Document analysis failed")
    }

    return {
        fileName: input.fileName,
        fileType,
        normalizedContent,
        truncated,
        analysis,
    }
}

function detectDocumentType(fileName: string, mimeType: string): SupportedDocumentType {
    const lowerName = fileName.toLowerCase()
    const lowerMime = mimeType.toLowerCase()

    if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) return "pdf"
    if (
        lowerName.endsWith(".xlsx") ||
        lowerName.endsWith(".xls") ||
        lowerMime.includes("spreadsheet") ||
        lowerMime.includes("excel")
    ) return "excel"
    if (lowerName.endsWith(".csv") || lowerMime.includes("csv")) return "csv"
    if (lowerName.endsWith(".json") || lowerMime.includes("json")) return "json"
    if (lowerName.endsWith(".txt") || lowerMime.startsWith("text/")) return "txt"

    throw new AgentExecutionError(
        "UNSUPPORTED_DOCUMENT_TYPE",
        "Supported file types are PDF, Excel, CSV, JSON, and TXT.",
        400
    )
}

async function normalizeDocument(buffer: Buffer, fileName: string, fileType: SupportedDocumentType) {
    switch (fileType) {
        case "pdf":
            return normalizePlainText(fileName, await extractPdfText(buffer))
        case "excel":
            return normalizeWorkbook(fileName, buffer)
        case "csv":
            return normalizeCsv(fileName, buffer)
        case "json":
            return normalizeJson(fileName, buffer)
        case "txt":
            return normalizePlainText(fileName, buffer.toString("utf-8"))
        default:
            throw new AgentExecutionError("UNSUPPORTED_DOCUMENT_TYPE", "Unsupported document type.", 400)
    }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
    let PDFParseCtor: (new (options: { data: Buffer }) => {
        getText: () => Promise<{ text?: string }>
        destroy: () => Promise<void>
    })

    try {
        const pdfParseModule = await import("pdf-parse")
        PDFParseCtor = pdfParseModule.PDFParse
    } catch (error) {
        throw new AgentExecutionError(
            "PDF_RUNTIME_UNAVAILABLE",
            error instanceof Error
                ? `PDF parser could not be loaded in the server runtime: ${error.message}`
                : "PDF parser could not be loaded in the server runtime.",
            500
        )
    }

    const parser = new PDFParseCtor({ data: buffer })

    try {
        const result = await parser.getText()
        return result.text ?? ""
    } catch (error) {
        throw new AgentExecutionError(
            "PDF_PARSE_FAILED",
            error instanceof Error ? `Failed to read PDF text: ${error.message}` : "Failed to read PDF text.",
            400
        )
    } finally {
        await parser.destroy().catch(() => undefined)
    }
}

function normalizePlainText(fileName: string, text: string) {
    const compactText = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim()

    if (!compactText) {
        throw new AgentExecutionError("EMPTY_DOCUMENT", `${fileName} does not contain readable text.`, 400)
    }

    return `DOCUMENT: ${fileName}\nTYPE: text\n\nCONTENT:\n${compactText}`
}

function normalizeWorkbook(fileName: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sections = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
            header: 1,
            defval: "",
            blankrows: false,
        }).slice(0, 60)

        const textRows = rows.map((row, index) => `${index + 1}. ${row.map((cell) => String(cell)).join(" | ")}`)
        return `SHEET: ${sheetName}\nROWS:\n${textRows.join("\n")}`
    }).filter(Boolean)

    if (sections.length === 0) {
        throw new AgentExecutionError("EMPTY_DOCUMENT", `${fileName} does not contain readable sheets.`, 400)
    }

    return `DOCUMENT: ${fileName}\nTYPE: spreadsheet\n\n${sections.join("\n\n")}`
}

function normalizeCsv(fileName: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
    }).slice(0, 80)

    if (rows.length === 0) {
        throw new AgentExecutionError("EMPTY_DOCUMENT", `${fileName} does not contain readable CSV rows.`, 400)
    }

    const textRows = rows.map((row, index) => `${index + 1}. ${row.map((cell) => String(cell)).join(" | ")}`)
    return `DOCUMENT: ${fileName}\nTYPE: csv\n\nROWS:\n${textRows.join("\n")}`
}

function normalizeJson(fileName: string, buffer: Buffer) {
    const raw = buffer.toString("utf-8")

    try {
        const parsed = JSON.parse(raw)
        const pretty = JSON.stringify(parsed, null, 2)
        return `DOCUMENT: ${fileName}\nTYPE: json\n\nCONTENT:\n${pretty}`
    } catch {
        throw new AgentExecutionError("INVALID_JSON", `${fileName} is not valid JSON.`, 400)
    }
}

function buildAnalysisPrompt(input: {
    fileName: string
    fileType: SupportedDocumentType
    question?: string
    normalizedContent: string
}) {
    return [
        `Analyze this document.`,
        `File name: ${input.fileName}`,
        `Detected type: ${input.fileType}`,
        input.question?.trim() ? `User question: ${input.question.trim()}` : "User question: none provided; give a strong general analysis.",
        "",
        "Processed document content:",
        input.normalizedContent,
    ].join("\n")
}

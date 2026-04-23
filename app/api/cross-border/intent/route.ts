import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { normalizeTaskFeatureConfig } from "@/lib/taskFeatures"

export const runtime = "nodejs"

function formatAmountXlm(rewardStroops: unknown) {
    const value = typeof rewardStroops === "string" ? Number(rewardStroops) : Number(rewardStroops ?? 0)
    if (!Number.isFinite(value) || value <= 0) return "0.0000000"
    return (value / 10_000_000).toFixed(7)
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as {
            taskId?: unknown
            walletAddress?: unknown
            onChainTaskId?: unknown
            rewardStroops?: unknown
            featureConfig?: unknown
        }

        const featureConfig = normalizeTaskFeatureConfig(body.featureConfig)
        if (featureConfig.settlementMethod === "wallet") {
            return NextResponse.json({ error: "Cross-border intent is only available for SEP-24 or SEP-31 tasks." }, { status: 400 })
        }

        if (!featureConfig.anchor.anchorUrl) {
            return NextResponse.json({ error: "Set an anchor URL in Settings before using SEP-24 or SEP-31 flows." }, { status: 400 })
        }

        const intentId = randomUUID()
        const amount = formatAmountXlm(body.rewardStroops)
        const anchorUrl = featureConfig.anchor.anchorUrl.replace(/\/+$/, "")
        const assetCode = featureConfig.anchor.assetCode ?? "USDC"
        const destination = featureConfig.anchor.destination ?? ""
        const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress : ""
        const onChainTaskId = typeof body.onChainTaskId === "string" ? body.onChainTaskId : ""

        const handoffUrl =
            featureConfig.settlementMethod === "sep24"
                ? `${anchorUrl}/transactions/deposit/interactive?asset_code=${encodeURIComponent(assetCode)}&account=${encodeURIComponent(walletAddress)}&amount=${encodeURIComponent(amount)}&memo=${encodeURIComponent(onChainTaskId)}`
                : `${anchorUrl}/transactions?asset_code=${encodeURIComponent(assetCode)}&amount=${encodeURIComponent(amount)}&destination=${encodeURIComponent(destination)}&memo=${encodeURIComponent(onChainTaskId)}`

        const instructions =
            featureConfig.settlementMethod === "sep24"
                ? `Open ${handoffUrl} to continue the SEP-24 interactive anchor flow for task ${body.taskId ?? "unknown"}.`
                : `Use ${handoffUrl} to start the SEP-31 payout handoff for task ${body.taskId ?? "unknown"}.`

        return NextResponse.json({
            success: true,
            intentId,
            instructions,
            handoffUrl,
        })
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create cross-border intent." },
            { status: 500 }
        )
    }
}

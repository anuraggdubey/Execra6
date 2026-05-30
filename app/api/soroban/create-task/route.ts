import { NextResponse } from "next/server"
import {
    Address,
    Keypair,
    nativeToScVal,
    Operation,
    rpc,
    TransactionBuilder,
    xdr,
} from "@stellar/stellar-sdk"
import { SOROBAN_CONFIG } from "@/lib/soroban/config"
import type { AgentType } from "@/types/tasks"

export const runtime = "nodejs"

const SOROBAN_FEE = "1000000"

function requireAdminSecret() {
    const secret = process.env.SOROBAN_SPONSOR_SECRET
    if (!secret) {
        throw new Error("Set SOROBAN_SPONSOR_SECRET to enable platform task creation.")
    }

    return secret
}

function symbolScVal(value: string) {
    return xdr.ScVal.scvSymbol(value)
}

function normalizeReward(value: unknown) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new Error("rewardStroops must be a positive integer string.")
    }

    const reward = BigInt(value)
    if (reward <= 0n) {
        throw new Error("rewardStroops must be greater than zero.")
    }

    return reward
}

function normalizeString(value: unknown, label: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} is required.`)
    }

    return value.trim()
}

function toClientError(error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create task on-chain."
    if (
        message.includes("InsufficientBalance") ||
        message.includes("#10") ||
        message.toLowerCase().includes("contract error")
    ) {
        return "Your Execra balance is too low. Deposit more XLM to run this agent."
    }

    return message
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as {
            walletAddress?: unknown
            onChainTaskId?: unknown
            agentType?: unknown
            rewardStroops?: unknown
        }

        const walletAddress = normalizeString(body.walletAddress, "walletAddress")
        const onChainTaskId = normalizeString(body.onChainTaskId, "onChainTaskId")
        const agentType = normalizeString(body.agentType, "agentType") as AgentType
        const rewardStroops = normalizeReward(body.rewardStroops)

        const admin = Keypair.fromSecret(requireAdminSecret())
        const server = new rpc.Server(SOROBAN_CONFIG.rpcUrl)
        const sourceAccount = await server.getAccount(admin.publicKey())
        const tx = new TransactionBuilder(sourceAccount, {
            fee: SOROBAN_FEE,
            networkPassphrase: SOROBAN_CONFIG.networkPassphrase,
        })
            .addOperation(
                Operation.invokeContractFunction({
                    contract: SOROBAN_CONFIG.contractId,
                    function: "create_task",
                    args: [
                        symbolScVal(onChainTaskId),
                        new Address(walletAddress).toScVal(),
                        symbolScVal(agentType),
                        nativeToScVal(rewardStroops, { type: "i128" }),
                    ],
                })
            )
            .setTimeout(60)
            .build()

        const prepared = await server.prepareTransaction(tx)
        prepared.sign(admin)
        const result = await server.sendTransaction(prepared)

        if (result.status !== "PENDING") {
            throw new Error(result.errorResult?.toString() ?? `Transaction rejected with status ${result.status}.`)
        }

        return NextResponse.json({
            success: true,
            status: result.status,
            txHash: result.hash,
        })
    } catch (error: unknown) {
        return NextResponse.json({ error: toClientError(error) }, { status: 400 })
    }
}

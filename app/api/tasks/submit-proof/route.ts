// Execra Platform
import { createHash } from "node:crypto"
import { Keypair, Operation, rpc, TransactionBuilder, xdr, Address } from "@stellar/stellar-sdk"
import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { SOROBAN_CONFIG } from "@/lib/soroban/config"
import { mapAgentTypeToAgentId, serializeTaskOutputForProof } from "@/lib/soroban/taskProof"
import { requireAgentType } from "@/lib/services/validation"

export const runtime = "nodejs"

const SOROBAN_FEE = "1000000"
type SubmitProofBody = {
    onChainTaskId?: unknown
    agentType?: unknown
    outputResult?: unknown
}

function requireProofExecutorSecret() {
    const secret = process.env.SOROBAN_PROOF_EXECUTOR_SECRET
    if (!secret) {
        throw new Error("Set SOROBAN_PROOF_EXECUTOR_SECRET to submit task proofs from the backend.")
    }

    return secret
}

function requireProofContractId() {
    const contractId = process.env.SOROBAN_PROOF_CONTRACT_ID ?? SOROBAN_CONFIG.proofContractId
    if (!contractId) {
        throw new Error("Set SOROBAN_PROOF_CONTRACT_ID or NEXT_PUBLIC_SOROBAN_PROOF_CONTRACT_ID to enable proof submission.")
    }

    return contractId
}

function requireOnChainTaskId(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
        throw new AgentExecutionError("INVALID_ONCHAIN_TASK_ID", "A valid on-chain task ID is required.", 400)
    }

    return value.trim()
}

function symbolScVal(value: string) {
    return xdr.ScVal.scvSymbol(value)
}

function bytesScValFromHex(hex: string) {
    return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"))
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSuccess(server: rpc.Server, txHash: string) {
    const delays = [500, 500, 1000, 1000, 1500, 1500, 2000, 2000]
    for (const delay of delays) {
        await sleep(delay)
        const tx = await server.getTransaction(txHash)
        if (tx.status === "SUCCESS") return
        if (tx.status === "FAILED") {
            throw new Error(`Task proof transaction failed on-chain (${txHash}).`)
        }
    }

    throw new Error(`Task proof transaction did not confirm in time (${txHash}).`)
}

async function submitProofToSoroban(params: {
    onChainTaskId: string
    agentType: ReturnType<typeof requireAgentType>
    outputHashHex: string
}) {
    const executor = Keypair.fromSecret(requireProofExecutorSecret())
    const server = new rpc.Server(SOROBAN_CONFIG.rpcUrl)
    const sourceAccount = await server.getAccount(executor.publicKey())
    const tx = new TransactionBuilder(sourceAccount, {
        fee: SOROBAN_FEE,
        networkPassphrase: SOROBAN_CONFIG.networkPassphrase,
    })
        .addOperation(
            Operation.invokeContractFunction({
                contract: requireProofContractId(),
                function: "submit_proof",
                args: [
                    new Address(executor.publicKey()).toScVal(),
                    symbolScVal(params.onChainTaskId),
                    bytesScValFromHex(params.outputHashHex),
                    symbolScVal(mapAgentTypeToAgentId(params.agentType)),
                ],
            })
        )
        .setTimeout(60)
        .build()

    const prepared = await server.prepareTransaction(tx)
    prepared.sign(executor)

    const result = await server.sendTransaction(prepared)
    if (result.status !== "PENDING") {
        throw new Error(`Task proof transaction was rejected (${result.status}).`)
    }

    await waitForSuccess(server, result.hash)

    return {
        txHash: result.hash,
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as SubmitProofBody
        const onChainTaskId = requireOnChainTaskId(body.onChainTaskId)
        const agentType = requireAgentType(body.agentType)
        const serializedOutput = serializeTaskOutputForProof(body.outputResult)
        const outputHashHex = createHash("sha256").update(serializedOutput).digest("hex")

        const submission = await submitProofToSoroban({
            onChainTaskId,
            agentType,
            outputHashHex,
        })

        return NextResponse.json({
            success: true,
            onChainTaskId,
            outputHashHex,
            proofTxHash: submission.txHash,
        })
    } catch (error: unknown) {
        if (error instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details },
                { status: error.status }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to submit task proof." },
            { status: 500 }
        )
    }
}

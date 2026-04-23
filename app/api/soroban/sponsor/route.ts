import { NextResponse } from "next/server"
import { Keypair, rpc, Transaction, TransactionBuilder } from "@stellar/stellar-sdk"
import { SOROBAN_CONFIG } from "@/lib/soroban/config"

export const runtime = "nodejs"

const DEFAULT_SPONSOR_FEE = "1000000"

function requireSponsorSecret() {
    const secret = process.env.SOROBAN_SPONSOR_SECRET
    if (!secret) {
        throw new Error("Set SOROBAN_SPONSOR_SECRET to enable sponsored transactions.")
    }

    return secret
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as {
            signedTransactionXdr?: unknown
        }

        if (typeof body.signedTransactionXdr !== "string" || !body.signedTransactionXdr.trim()) {
            return NextResponse.json({ error: "signedTransactionXdr is required." }, { status: 400 })
        }

        const sponsor = Keypair.fromSecret(requireSponsorSecret())
        const innerTransaction = TransactionBuilder.fromXDR(body.signedTransactionXdr, SOROBAN_CONFIG.networkPassphrase)
        if (!("operations" in innerTransaction)) {
            return NextResponse.json({ error: "signedTransactionXdr must be a standard transaction, not a fee bump envelope." }, { status: 400 })
        }
        const sponsoredInnerTransaction = innerTransaction as Transaction
        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
            sponsor,
            DEFAULT_SPONSOR_FEE,
            sponsoredInnerTransaction,
            SOROBAN_CONFIG.networkPassphrase
        )

        feeBump.sign(sponsor)

        const server = new rpc.Server(SOROBAN_CONFIG.rpcUrl)
        const result = await server.sendTransaction(feeBump)

        return NextResponse.json({
            success: true,
            status: result.status,
            hash: result.hash,
        })
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to sponsor transaction." },
            { status: 500 }
        )
    }
}

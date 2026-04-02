"use client"

import albedo from "@albedo-link/intent"
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api"
import { TransactionBuilder } from "@stellar/stellar-sdk"
import { xBullWalletConnect } from "@creit.tech/xbull-wallet-connect"
import type { SupportedWalletId } from "@/lib/wallet/stellarWallets"

type SignSorobanTransactionParams = {
    walletType: SupportedWalletId | null
    walletAddress: string
    transactionXdr: string
    networkPassphrase: string
}

function requireWalletType(walletType: SupportedWalletId | null): SupportedWalletId {
    if (!walletType) {
        throw new Error("Connect a supported wallet before signing Soroban transactions.")
    }

    return walletType
}

async function signWithFreighter(params: SignSorobanTransactionParams) {
    const signed = await freighterSignTransaction(params.transactionXdr, {
        address: params.walletAddress,
        networkPassphrase: params.networkPassphrase,
    })

    if (signed.error || !signed.signedTxXdr) {
        throw new Error(signed.error?.message ?? "Freighter did not return a signed transaction.")
    }

    return signed.signedTxXdr
}

async function signWithXBull(params: SignSorobanTransactionParams) {
    const bridge = new xBullWalletConnect()

    try {
        return await bridge.sign({
            xdr: params.transactionXdr,
            network: params.networkPassphrase,
            publicKey: params.walletAddress,
        })
    } finally {
        bridge.closeConnections()
    }
}

async function signWithAlbedo(params: SignSorobanTransactionParams) {
    const result = await albedo.tx({
        xdr: params.transactionXdr,
        pubkey: params.walletAddress,
        network: params.networkPassphrase,
        submit: false,
    })

    if (!result.signed_envelope_xdr) {
        throw new Error("Albedo did not return a signed transaction.")
    }

    return result.signed_envelope_xdr
}

export async function signSorobanTransaction(params: SignSorobanTransactionParams) {
    const walletType = requireWalletType(params.walletType)

    const signedXdr =
        walletType === "freighter" ? await signWithFreighter(params) :
        walletType === "xbull" ? await signWithXBull(params) :
        await signWithAlbedo(params)

    return TransactionBuilder.fromXDR(signedXdr, params.networkPassphrase)
}

"use client"

import albedo from "@albedo-link/intent"
import { isConnected, requestAccess } from "@stellar/freighter-api"
import { xBullWalletConnect } from "@creit.tech/xbull-wallet-connect"

export type SupportedWalletId = "freighter" | "xbull" | "albedo"

export type SupportedStellarWallet = {
    id: SupportedWalletId
    name: string
    icon: string
    isAvailable: boolean
    url: string
}

const WALLET_CATALOG: Record<SupportedWalletId, Omit<SupportedStellarWallet, "isAvailable">> = {
    freighter: {
        id: "freighter",
        name: "Freighter",
        icon: "https://stellar.creit.tech/wallet-icons/freighter.png",
        url: "https://freighter.app",
    },
    xbull: {
        id: "xbull",
        name: "xBull",
        icon: "https://stellar.creit.tech/wallet-icons/xbull.png",
        url: "https://xbull.app",
    },
    albedo: {
        id: "albedo",
        name: "Albedo",
        icon: "https://stellar.creit.tech/wallet-icons/albedo.png",
        url: "https://albedo.link",
    },
}

function normalizeWalletErrorMessage(message: string) {
    const normalized = message.trim()
    const lowered = normalized.toLowerCase()

    if (lowered.includes("metamask") || lowered.includes("ethereum")) {
        return "Only Stellar wallets are supported here. Please connect with Freighter, xBull, or Albedo."
    }

    return normalized
}

export function extractWalletError(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
        return normalizeWalletErrorMessage(error.message)
    }

    if (typeof error === "string" && error.trim()) {
        return normalizeWalletErrorMessage(error)
    }

    if (error && typeof error === "object") {
        const candidate = error as {
            message?: unknown
            code?: unknown
            ext?: unknown
            error?: { message?: unknown; code?: unknown }
        }

        const nestedMessage =
            typeof candidate.error?.message === "string" ? candidate.error.message :
            typeof candidate.message === "string" ? candidate.message :
            null

        if (nestedMessage && nestedMessage.trim()) {
            if (candidate.code === -4) {
                return "The wallet request was rejected. Please approve the request in the wallet popup and try again."
            }

            if (candidate.code === -3) {
                return "The wallet rejected the request format. Please retry or try another supported wallet."
            }

            if (candidate.code === -2) {
                return "The wallet reported an external error. Check the wallet popup or extension and try again."
            }

            return normalizeWalletErrorMessage(nestedMessage)
        }

        const parts = [
            typeof candidate.code === "number" || typeof candidate.code === "string" ? `code ${candidate.code}` : null,
            typeof candidate.ext === "string" ? candidate.ext : null,
        ].filter(Boolean)

        if (parts.length > 0) {
            return `Wallet connection failed (${parts.join(", ")}).`
        }

        try {
            const serialized = JSON.stringify(error)
            if (serialized && serialized !== "{}") {
                return normalizeWalletErrorMessage(serialized)
            }
        } catch {
            // Ignore serialization failure.
        }
    }

    return "Wallet connection failed"
}

async function isFreighterAvailable() {
    try {
        const response = await isConnected()
        return !response.error && response.isConnected
    } catch {
        return false
    }
}

export async function getSupportedStellarWallets(): Promise<SupportedStellarWallet[]> {
    const freighterAvailable = typeof window !== "undefined" ? await isFreighterAvailable() : false

    return [
        {
            ...WALLET_CATALOG.freighter,
            isAvailable: freighterAvailable,
        },
        {
            ...WALLET_CATALOG.xbull,
            isAvailable: true,
        },
        {
            ...WALLET_CATALOG.albedo,
            isAvailable: true,
        },
    ]
}

async function connectFreighterWallet() {
    const result = await requestAccess()
    if (result.error || !result.address) {
        throw result.error ?? new Error("Freighter did not return an address.")
    }
    return result.address
}

async function connectXBullWallet() {
    const bridge = new xBullWalletConnect({
        preferredTarget: "website",
        url: "https://wallet.xbull.app/connect",
    })

    try {
        return await bridge.connect()
    } finally {
        bridge.closeConnections()
    }
}

async function connectAlbedoWallet() {
    const result = await albedo.publicKey({})
    if (!result.pubkey) {
        throw new Error("Albedo did not return a public key.")
    }
    return result.pubkey
}

export async function connectStellarWallet(walletId: SupportedWalletId) {
    try {
        const walletAddress =
            walletId === "freighter" ? await connectFreighterWallet() :
            walletId === "xbull" ? await connectXBullWallet() :
            await connectAlbedoWallet()

        return {
            walletAddress,
            walletProviderId: walletId,
        }
    } catch (error) {
        const message = extractWalletError(error)
        console.error(`[wallet] ${walletId} connection failed`, {
            message,
            raw: error,
            serialized: (() => {
                try {
                    return JSON.stringify(error)
                } catch {
                    return null
                }
            })(),
        })
        throw new Error(message)
    }
}

export async function disconnectStellarWallet() {
    return
}

export async function fetchStellarTestnetBalance(walletAddress: string) {
    const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${walletAddress}`, {
        cache: "no-store",
    })

    if (response.status === 404) {
        return "0.0000000"
    }

    if (!response.ok) {
        throw new Error("Unable to load Stellar testnet balance")
    }

    const account = await response.json()
    const nativeBalance = Array.isArray(account.balances)
        ? account.balances.find((balance: { asset_type?: string }) => balance.asset_type === "native")
        : null

    return typeof nativeBalance?.balance === "string" ? nativeBalance.balance : "0.0000000"
}

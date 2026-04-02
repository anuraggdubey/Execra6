export const SOROBAN_CONFIG = {
    network: process.env.NEXT_PUBLIC_SOROBAN_NETWORK ?? "testnet",
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
    contractId: process.env.NEXT_PUBLIC_SOROBAN_CONTRACT_ID ?? "",
    xlmSacId: process.env.NEXT_PUBLIC_STELLAR_XLM_SAC_ID ?? "",
} as const

export function sorobanConfigured() {
    return Boolean(
        SOROBAN_CONFIG.network &&
        SOROBAN_CONFIG.rpcUrl &&
        SOROBAN_CONFIG.networkPassphrase &&
        SOROBAN_CONFIG.contractId
    )
}

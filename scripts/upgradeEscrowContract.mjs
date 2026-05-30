/**
 * upgradeEscrowContract.mjs
 *
 * Rebuilds task_escrow from the current XLM-only source and upgrades the
 * deployed testnet contract so the on-chain WASM includes platform balances.
 *
 * Required env vars (reads .env.local automatically via dotenv):
 *   SOROBAN_SPONSOR_SECRET   – admin secret key that can call `upgrade`
 *   NEXT_PUBLIC_SOROBAN_CONTRACT_ID – deployed escrow contract address
 *
 * Usage:
 *   node scripts/upgradeEscrowContract.mjs
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

// ── Load .env.local manually (no dotenv dependency needed) ──────────────────
const rootDir = process.cwd()
try {
  const envContent = readFileSync(path.join(rootDir, ".env.local"), "utf8")
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // .env.local may not exist; rely on actual env vars
}

// ── Config ──────────────────────────────────────────────────────────────────
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"
const CONTRACT_ID = process.env.NEXT_PUBLIC_SOROBAN_CONTRACT_ID
const ADMIN_SECRET = process.env.SOROBAN_SPONSOR_SECRET

if (!CONTRACT_ID) throw new Error("Missing NEXT_PUBLIC_SOROBAN_CONTRACT_ID")
if (!ADMIN_SECRET) throw new Error("Missing SOROBAN_SPONSOR_SECRET (admin key)")

const taskEscrowDir = path.join(rootDir, "contracts", "task_escrow")

function run(args, cwd = rootDir) {
  console.log(`$ stellar ${args.join(" ")}`)
  return execFileSync("stellar", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
}

// ── Step 1: Rebuild the contract from clean source ──────────────────────────
console.log("\n🔨 Building task_escrow from source...\n")
run(["contract", "build", "--package", "task_escrow", "--out-dir", "target"], taskEscrowDir)
console.log("✅ Build complete.\n")

// ── Step 2: Upload the new WASM to testnet ──────────────────────────────────
const wasmPath = path.join(taskEscrowDir, "target", "task_escrow.wasm")
console.log("📤 Uploading WASM to testnet...\n")
const wasmHash = run([
  "contract", "upload",
  "--wasm", wasmPath,
  "--source-account", ADMIN_SECRET,
  "--rpc-url", RPC_URL,
  "--network-passphrase", TESTNET_PASSPHRASE,
])
console.log(`✅ WASM uploaded. Hash: ${wasmHash}\n`)

// ── Step 3: Get the admin address from the secret key ───────────────────────
// We need the public address to pass as --admin arg
let adminAddress
try {
  adminAddress = run([
    "keys", "address", ADMIN_SECRET,
  ])
} catch {
  // Some versions use a different subcommand. Try to derive it another way.
  // The sponsor secret starts with S, we can try "stellar keys show"
  try {
    adminAddress = execFileSync("stellar", ["keys", "address", "--secret-key", ADMIN_SECRET], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    // Last resort: the user must provide it
    adminAddress = process.env.STELLAR_ADMIN_ADDRESS || ""
    if (!adminAddress) {
      throw new Error("Could not derive admin public address. Set STELLAR_ADMIN_ADDRESS env var.")
    }
  }
}
console.log(`Admin address: ${adminAddress}\n`)

// ── Step 4: Call upgrade on the deployed contract ───────────────────────────
console.log("🚀 Upgrading deployed contract...\n")
run([
  "contract", "invoke",
  "--id", CONTRACT_ID,
  "--source-account", ADMIN_SECRET,
  "--rpc-url", RPC_URL,
  "--network-passphrase", TESTNET_PASSPHRASE,
  "--",
  "upgrade",
  "--admin", adminAddress,
  "--new_wasm_hash", wasmHash,
])
console.log("✅ Contract upgraded successfully!\n")
console.log(`Contract: ${CONTRACT_ID}`)
console.log(`New WASM: ${wasmHash}`)
console.log("\nThe deployed testnet task_escrow now includes deposit, withdraw, get_balance, and balance-backed create_task.")

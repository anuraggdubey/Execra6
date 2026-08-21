// Execra Platform
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"
const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org"
const rootDir = process.cwd()
const contractsDir = path.join(rootDir, "contracts")
const taskEscrowDir = path.join(contractsDir, "task_escrow")
const taskProofDir = path.join(contractsDir, "task_proof")
const contractsPath = path.join(rootDir, "contracts.testnet.json")

const config = {
  rpcUrl: process.env.STELLAR_RPC_URL || DEFAULT_RPC_URL,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || TESTNET_PASSPHRASE,
  sourceAccount: process.env.STELLAR_ACCOUNT || process.env.STELLAR_SECRET_KEY || "",
  adminAddress: process.env.STELLAR_ADMIN_ADDRESS || "",
  backendExecutorWallet: process.env.TASK_PROOF_EXECUTOR_WALLET || "",
}

for (const [name, value] of Object.entries(config)) {
  if (!value) {
    throw new Error(`Missing required testnet config: ${name}`)
  }
}

function runStellar(args, cwd = rootDir) {
  return execFileSync("stellar", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
}

function buildContract(cwd, packageName) {
  runStellar(["contract", "build", "--package", packageName, "--out-dir", "target"], cwd)
}

function deployContract(wasmPath) {
  return runStellar([
    "contract",
    "deploy",
    "--wasm",
    wasmPath,
    "--source-account",
    config.sourceAccount,
    "--rpc-url",
    config.rpcUrl,
    "--network-passphrase",
    config.networkPassphrase,
  ])
}

function uploadContract(wasmPath) {
  return runStellar([
    "contract",
    "upload",
    "--wasm",
    wasmPath,
    "--source-account",
    config.sourceAccount,
    "--rpc-url",
    config.rpcUrl,
    "--network-passphrase",
    config.networkPassphrase,
  ])
}

function invokeContract(contractId, fnName, args = []) {
  return runStellar([
    "contract",
    "invoke",
    "--id",
    contractId,
    "--source-account",
    config.sourceAccount,
    "--rpc-url",
    config.rpcUrl,
    "--network-passphrase",
    config.networkPassphrase,
    "--",
    fnName,
    ...args,
  ])
}

const existing = JSON.parse(readFileSync(contractsPath, "utf8"))
if (!existing.task_escrow || !existing.agent_registry) {
  throw new Error("contracts.testnet.json must already contain task_escrow and agent_registry IDs.")
}

buildContract(taskProofDir, "task_proof")
buildContract(taskEscrowDir, "task_escrow")

const uploadedEscrowWasmHash = uploadContract(path.join(taskEscrowDir, "target", "task_escrow.wasm"))
invokeContract(existing.task_escrow, "upgrade", [
  "--admin",
  config.adminAddress,
  "--new_wasm_hash",
  uploadedEscrowWasmHash,
])

const taskProofId = deployContract(path.join(taskProofDir, "target", "task_proof.wasm"))
invokeContract(taskProofId, "init", [
  "--admin",
  config.adminAddress,
  "--task_escrow",
  existing.task_escrow,
])
invokeContract(taskProofId, "authorize_executor", [
  "--admin",
  config.adminAddress,
  "--executor",
  config.backendExecutorWallet,
])
invokeContract(existing.task_escrow, "set_proof_contract", [
  "--admin",
  config.adminAddress,
  "--proof_contract",
  taskProofId,
])

const updatedContracts = {
  network: "testnet",
  agent_registry: existing.agent_registry,
  task_escrow: existing.task_escrow,
  task_proof: taskProofId,
}

writeFileSync(contractsPath, `${JSON.stringify(updatedContracts, null, 2)}\n`, "utf8")
console.log(JSON.stringify(updatedContracts, null, 2))

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Asset, Keypair, Networks } from "@stellar/stellar-sdk"

const MAINNET_PASSPHRASE = Networks.PUBLIC
const DEFAULT_RPC_URL = "https://soroban-rpc.mainnet.stellar.gateway.fm"
const DEFAULT_HORIZON_URL = "https://horizon.stellar.org"
const DEFAULT_DEPLOYER_PUBLIC = "GCBUI4DWP2ILEL4QHANJUGE3B5KGEJ2SQIL65I2X44EUXIGL7WJ532WD"
const MAX_SPEND_XLM = Number(process.env.SOROBAN_MAINNET_MAX_SPEND_XLM || "40")

const rootDir = process.cwd()
const contractsDir = path.join(rootDir, "contracts")
const contractsPath = path.join(rootDir, "contracts.mainnet.json")
const envMainnetPath = path.join(rootDir, ".env.mainnet")

loadEnvFile(envMainnetPath)

const config = {
  rpcUrl: process.env.STELLAR_RPC_URL || process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_RPC_URL,
  horizonUrl: process.env.STELLAR_HORIZON_URL || DEFAULT_HORIZON_URL,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE || MAINNET_PASSPHRASE,
  sourceSecret: firstUsableSecret(
    process.env.SOROBAN_MAINNET_DEPLOYER_SECRET,
    process.env.STELLAR_SECRET_KEY,
    process.env.STELLAR_ACCOUNT
  ),
  expectedPublic: process.env.SOROBAN_MAINNET_DEPLOYER_PUBLIC || DEFAULT_DEPLOYER_PUBLIC,
  proofExecutorSecret: firstUsableSecret(
    process.env.SOROBAN_PROOF_EXECUTOR_SECRET,
    process.env.SOROBAN_MAINNET_DEPLOYER_SECRET,
    process.env.STELLAR_SECRET_KEY
  ),
}

const agentDefinitions = [
  ["github_agent", "github"],
  ["coding_agent", "coding"],
  ["document_agent", "document"],
  ["email_agent", "email"],
  ["websearch_agent", "search"],
  ["browser_agent", "browser"],
]

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const separatorIndex = trimmed.indexOf("=")
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function normalizeSecret(value = "") {
  if (!value || value.includes("REPLACE_WITH")) return ""
  return value
}

function firstUsableSecret(...values) {
  for (const value of values) {
    const normalized = normalizeSecret(value)
    if (normalized) return normalized
  }

  return ""
}

function requireConfig() {
  if (config.networkPassphrase !== MAINNET_PASSPHRASE) {
    throw new Error(`Refusing mainnet deploy with unexpected passphrase: ${config.networkPassphrase}`)
  }

  if (!Number.isFinite(MAX_SPEND_XLM) || MAX_SPEND_XLM <= 0 || MAX_SPEND_XLM > 40) {
    throw new Error("SOROBAN_MAINNET_MAX_SPEND_XLM must be greater than 0 and no more than 40.")
  }

  if (!config.sourceSecret || config.sourceSecret.includes("REPLACE_WITH")) {
    throw new Error("Set SOROBAN_MAINNET_DEPLOYER_SECRET to the mainnet secret key before deploying.")
  }

  const source = Keypair.fromSecret(config.sourceSecret)
  if (source.publicKey() !== config.expectedPublic) {
    throw new Error(`Secret key resolves to ${source.publicKey()}, expected ${config.expectedPublic}.`)
  }

  if (!config.proofExecutorSecret || config.proofExecutorSecret.includes("REPLACE_WITH")) {
    throw new Error("Set SOROBAN_PROOF_EXECUTOR_SECRET, or let it default to SOROBAN_MAINNET_DEPLOYER_SECRET.")
  }
}

function runStellar(args, cwd = rootDir) {
  try {
    return execFileSync("stellar", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).trim()
  } catch (error) {
    const command = ["stellar", ...args.map((arg) => arg === config.sourceSecret ? "<redacted-secret>" : arg)].join(" ")
    const status = typeof error === "object" && error !== null && "status" in error ? ` exited with ${error.status}` : " failed"
    throw new Error(`${command}${status}`)
  }
}

function stellarNetworkArgs() {
  return [
    "--source-account",
    config.sourceSecret,
    "--rpc-url",
    config.rpcUrl,
    "--network-passphrase",
    config.networkPassphrase,
    "--cost",
  ]
}

async function getNativeBalance(publicKey) {
  const response = await fetch(`${config.horizonUrl}/accounts/${publicKey}`)
  if (!response.ok) {
    throw new Error(`Could not read mainnet balance for ${publicKey}: HTTP ${response.status}`)
  }

  const account = await response.json()
  const nativeBalance = account.balances?.find((balance) => balance.asset_type === "native")
  if (!nativeBalance?.balance) {
    throw new Error(`No native XLM balance found for ${publicKey}.`)
  }

  return Number(nativeBalance.balance)
}

async function assertSpendWithinCap(startingBalance, publicKey, label) {
  const currentBalance = await getNativeBalance(publicKey)
  const spent = startingBalance - currentBalance
  if (spent > MAX_SPEND_XLM) {
    throw new Error(`${label} pushed spend to ${spent.toFixed(7)} XLM, above the ${MAX_SPEND_XLM} XLM cap. Stopping now.`)
  }
  console.log(`${label}: spent about ${spent.toFixed(7)} XLM of ${MAX_SPEND_XLM} XLM cap.`)
}

function buildContract(packageName) {
  const cwd = path.join(contractsDir, packageName)
  runStellar(["contract", "build", "--package", packageName, "--out-dir", "target"], cwd)
  return path.join(cwd, "target", `${packageName}.wasm`)
}

function deployContract(wasmPath) {
  return runStellar([
    "contract",
    "deploy",
    "--wasm",
    wasmPath,
    ...stellarNetworkArgs(),
  ])
}

function invokeContract(contractId, fnName, args = []) {
  return runStellar([
    "contract",
    "invoke",
    "--id",
    contractId,
    ...stellarNetworkArgs(),
    "--",
    fnName,
    ...args,
  ])
}

function readContracts() {
  if (!existsSync(contractsPath)) {
    return {
      network: "mainnet",
      rpcUrl: config.rpcUrl,
      deployer: config.expectedPublic,
      xlmSacId: Asset.native().contractId(MAINNET_PASSPHRASE),
      agent_registry: "",
      task_escrow: "",
      task_proof: "",
      setup: {},
    }
  }

  const contracts = JSON.parse(readFileSync(contractsPath, "utf8"))
  contracts.setup ||= {}
  return contracts
}

function writeContracts(contracts) {
  writeFileSync(contractsPath, `${JSON.stringify(contracts, null, 2)}\n`, "utf8")
}

function writeEnvMainnet(contracts) {
  const body = [
    "NEXT_PUBLIC_SOROBAN_NETWORK=mainnet",
    `NEXT_PUBLIC_SOROBAN_RPC_URL=${config.rpcUrl}`,
    `NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE=${MAINNET_PASSPHRASE}`,
    `NEXT_PUBLIC_STELLAR_XLM_SAC_ID=${contracts.xlmSacId}`,
    `NEXT_PUBLIC_SOROBAN_CONTRACT_ID=${contracts.task_escrow}`,
    `NEXT_PUBLIC_SOROBAN_PROOF_CONTRACT_ID=${contracts.task_proof}`,
    "",
    `SOROBAN_MAINNET_DEPLOYER_PUBLIC=${config.expectedPublic}`,
    "SOROBAN_MAINNET_DEPLOYER_SECRET=REPLACE_WITH_MAINNET_SECRET_KEY",
    `SOROBAN_MAINNET_MAX_SPEND_XLM=${MAX_SPEND_XLM}`,
    "",
    "# Runtime server signer. This must be the same admin account used at deploy time.",
    "SOROBAN_SPONSOR_SECRET=REPLACE_WITH_MAINNET_SECRET_KEY",
    "",
    "# Proof signer. Reuse the deployer secret unless you set a different executor and authorize it.",
    "SOROBAN_PROOF_EXECUTOR_SECRET=REPLACE_WITH_MAINNET_SECRET_KEY",
    "",
  ].join("\n")

  writeFileSync(envMainnetPath, body, "utf8")
}

async function runSetupStep(contracts, key, label, fn, startingBalance, publicKey) {
  if (contracts.setup?.[key]) {
    console.log(`${label}: already done.`)
    return
  }

  fn()
  contracts.setup ||= {}
  contracts.setup[key] = true
  writeContracts(contracts)
  await assertSpendWithinCap(startingBalance, publicKey, label)
}

requireConfig()

const deployer = Keypair.fromSecret(config.sourceSecret)
const proofExecutor = Keypair.fromSecret(config.proofExecutorSecret)
const xlmSacId = Asset.native().contractId(MAINNET_PASSPHRASE)
const contracts = readContracts()

console.log(`Deploying Execra contracts to Stellar mainnet from ${deployer.publicKey()}`)
console.log(`RPC: ${config.rpcUrl}`)
console.log(`Native XLM SAC: ${xlmSacId}`)
console.log(`Spend cap: ${MAX_SPEND_XLM} XLM`)

console.log("\nBuilding contracts...")
const registryWasm = buildContract("agent_registry")
const escrowWasm = buildContract("task_escrow")
const proofWasm = buildContract("task_proof")

contracts.network = "mainnet"
contracts.rpcUrl = config.rpcUrl
contracts.deployer = deployer.publicKey()
contracts.xlmSacId = xlmSacId
contracts.setup ||= {}
contracts.spendBaselineXlm ||= await getNativeBalance(deployer.publicKey())
const startingBalance = Number(contracts.spendBaselineXlm)
writeContracts(contracts)

if (!contracts.agent_registry) {
  console.log("\nDeploying agent_registry...")
  contracts.agent_registry = deployContract(registryWasm)
  writeContracts(contracts)
  await assertSpendWithinCap(startingBalance, deployer.publicKey(), "agent_registry deploy")
}

if (!contracts.task_escrow) {
  console.log("\nDeploying task_escrow...")
  contracts.task_escrow = deployContract(escrowWasm)
  writeContracts(contracts)
  await assertSpendWithinCap(startingBalance, deployer.publicKey(), "task_escrow deploy")
}

if (!contracts.task_proof) {
  console.log("\nDeploying task_proof...")
  contracts.task_proof = deployContract(proofWasm)
  writeContracts(contracts)
  await assertSpendWithinCap(startingBalance, deployer.publicKey(), "task_proof deploy")
}

console.log("\nInitializing and linking contracts...")
await runSetupStep(contracts, "agent_registry_init", "agent_registry init", () => {
  invokeContract(contracts.agent_registry, "init", ["--admin", deployer.publicKey()])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "task_escrow_init", "task_escrow init", () => {
  invokeContract(contracts.task_escrow, "init", [
    "--admin",
    deployer.publicKey(),
    "--token_contract",
    xlmSacId,
  ])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "task_proof_init", "task_proof init", () => {
  invokeContract(contracts.task_proof, "init", [
    "--admin",
    deployer.publicKey(),
    "--task_escrow",
    contracts.task_escrow,
  ])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "set_registry", "set registry", () => {
  invokeContract(contracts.task_escrow, "set_registry", [
    "--admin",
    deployer.publicKey(),
    "--registry_contract",
    contracts.agent_registry,
  ])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "set_proof_contract", "set proof contract", () => {
  invokeContract(contracts.task_escrow, "set_proof_contract", [
    "--admin",
    deployer.publicKey(),
    "--proof_contract",
    contracts.task_proof,
  ])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "authorize_registry_caller", "authorize escrow in registry", () => {
  invokeContract(contracts.agent_registry, "authorize_caller", [
    "--admin",
    deployer.publicKey(),
    "--caller",
    contracts.task_escrow,
  ])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "authorize_proof_executor", "authorize proof executor", () => {
  invokeContract(contracts.task_proof, "authorize_executor", [
    "--admin",
    deployer.publicKey(),
    "--executor",
    proofExecutor.publicKey(),
  ])
}, startingBalance, deployer.publicKey())

await runSetupStep(contracts, "authorize_escrow_executor", "authorize escrow executor", () => {
  invokeContract(contracts.task_escrow, "set_executor", [
    "--executor",
    proofExecutor.publicKey(),
    "--allowed",
    "true",
  ])
}, startingBalance, deployer.publicKey())

console.log("\nRegistering agents...")
for (const [agentId, agentType] of agentDefinitions) {
  const setupKey = `register_${agentId}`
  if (contracts.setup[setupKey]) {
    console.log(`register ${agentId}: already done.`)
    continue
  }

  try {
    invokeContract(contracts.agent_registry, "register_agent", [
      "--admin",
      deployer.publicKey(),
      "--agent_id",
      agentId,
      "--agent_type",
      agentType,
      "--wallet_address",
      deployer.publicKey(),
    ])
    contracts.setup[setupKey] = true
    writeContracts(contracts)
    await assertSpendWithinCap(startingBalance, deployer.publicKey(), `register ${agentId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("HostError") && !message.includes("contract error")) throw error
    console.warn(`Could not register ${agentId}; it may already exist.`)
  }
}

writeContracts(contracts)
writeEnvMainnet(contracts)

const finalBalance = await getNativeBalance(deployer.publicKey())
const totalSpent = startingBalance - finalBalance

console.log("\nMainnet deployment complete.")
console.log(JSON.stringify(contracts, null, 2))
console.log(`Spent about ${totalSpent.toFixed(7)} XLM.`)
console.log("Updated contracts.mainnet.json and .env.mainnet.")

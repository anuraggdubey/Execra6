//! # Execra Task Proof Smart Contract
//!
//! The `TaskProofContract` records, indexes, and cryptographically verifies execution proofs
//! submitted by authorized backend executors upon completing agent workloads on Stellar Soroban.
//!
//! ## Key Capabilities
//! - **Cryptographic Proof Submission**: Authorized executors record the 32-byte SHA-256 output hash of task results.
//! - **Immutable Verification**: Cross-contract or on-chain verification matching submitted output hashes against execution results.
//! - **Agent Proof Indexing**: Secondary indexing (`AgentProofs`) enabling fast retrieval of all task proofs produced by a specific agent.
//! - **Role-Based Access Control**: Admin-governed authorization and revocation of executor addresses.
//! - **Storage Archival Protection**: Automatic Soroban TTL extension on instance and persistent storage keys.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    Symbol, Vec,
};

// ============================================================================
// Constants & Configuration
// ============================================================================

/// TTL threshold (in ledgers) before triggering an instance storage TTL bump (~30 days).
const INSTANCE_BUMP_THRESHOLD: u32 = 518_400;

/// Number of ledgers to extend instance storage lifetime when threshold is met (~31 days).
const INSTANCE_BUMP_AMOUNT: u32 = 535_680;

/// TTL threshold (in ledgers) before triggering a persistent storage TTL bump (~30 days).
const PERSISTENT_BUMP_THRESHOLD: u32 = 518_400;

/// Number of ledgers to extend persistent storage lifetime when threshold is met (~31 days).
const PERSISTENT_BUMP_AMOUNT: u32 = 535_680;

// ============================================================================
// Data Types & Storage Keys
// ============================================================================

/// Represents a cryptographically verifiable execution proof for a completed task.
#[contracttype]
#[derive(Clone, Eq, PartialEq, Debug)]
pub struct TaskProof {
    /// Unique identifier symbol for the associated task.
    pub task_id: Symbol,
    /// 32-byte SHA-256 hash of the execution output payload.
    pub output_hash: BytesN<32>,
    /// Identifier symbol of the agent that performed the workload.
    pub agent_id: Symbol,
    /// Stellar address of the authorized executor that submitted this proof.
    pub submitted_by: Address,
    /// Boolean flag indicating whether the proof has been successfully verified during settlement.
    pub verified: bool,
    /// Ledger timestamp (Unix seconds) when the proof was submitted.
    pub submitted_at: u64,
}

/// Storage keys for indexing contract state.
#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Persistent key storing `TaskProof` records, indexed by task ID.
    Proof(Symbol),
    /// Instance key storing the list of authorized backend executor addresses.
    Executors,
    /// Persistent key storing a list of task IDs executed by a specific agent ID.
    AgentProofs(Symbol),
}

// ============================================================================
// Error Codes
// ============================================================================

/// Error codes returned by the Task Proof contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TaskProofError {
    /// The contract has already been initialized with an admin address.
    AlreadyInitialized = 1,
    /// The caller lacks authorization for this privileged operation.
    Unauthorized = 2,
    /// A proof has already been submitted for the specified task ID.
    ProofAlreadyExists = 3,
    /// No proof record was found for the specified task ID.
    ProofNotFound = 4,
}

// ============================================================================
// Smart Contract Implementation
// ============================================================================

#[contract]
pub struct TaskProofContract;

#[contractimpl]
impl TaskProofContract {
    // ------------------------------------------------------------------------
    // 1. Initialization
    // ------------------------------------------------------------------------

    /// Initializes the Task Proof contract with an administrator and linked TaskEscrow contract.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The administrator Stellar address.
    /// * `task_escrow` - The address of the linked `TaskEscrow` smart contract.
    ///
    /// # Errors
    /// * `TaskProofError::AlreadyInitialized` - If already initialized.
    pub fn init(env: Env, admin: Address, task_escrow: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            soroban_sdk::panic_with_error!(&env, TaskProofError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("ESCROW"), &task_escrow);
        env.storage()
            .instance()
            .set(&DataKey::Executors, &Vec::<Address>::new(&env));
        extend_instance(&env);
    }

    // ------------------------------------------------------------------------
    // 2. Proof Submission & Verification
    // ------------------------------------------------------------------------

    /// Submits a cryptographic proof of task completion.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `caller` - The authorized executor address submitting the proof.
    /// * `task_id` - Identifier symbol of the executed task.
    /// * `output_hash` - 32-byte SHA-256 hash of the execution output.
    /// * `agent_id` - Identifier symbol of the agent that performed the work.
    ///
    /// # Errors
    /// * `TaskProofError::Unauthorized` - If caller is not an authorized executor.
    /// * `TaskProofError::ProofAlreadyExists` - If a proof for this task ID already exists.
    pub fn submit_proof(
        env: Env,
        caller: Address,
        task_id: Symbol,
        output_hash: BytesN<32>,
        agent_id: Symbol,
    ) {
        caller.require_auth();
        if !Self::is_authorized_executor(env.clone(), caller.clone()) {
            soroban_sdk::panic_with_error!(&env, TaskProofError::Unauthorized);
        }

        let key = DataKey::Proof(task_id.clone());
        if env.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(&env, TaskProofError::ProofAlreadyExists);
        }

        let proof = TaskProof {
            task_id: task_id.clone(),
            output_hash,
            agent_id: agent_id.clone(),
            submitted_by: caller,
            verified: false,
            submitted_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &proof);
        extend_persistent(&env, &key);

        // Append to agent secondary index for historical lookup
        let agent_key = DataKey::AgentProofs(agent_id);
        let mut proofs = read_agent_proofs(&env, &agent_key);
        proofs.push_back(task_id);
        env.storage().persistent().set(&agent_key, &proofs);
        extend_persistent(&env, &agent_key);
        extend_instance(&env);
    }

    /// Verifies the submitted proof output hash against a supplied hash.
    ///
    /// If the hash matches, sets `verified = true` on the proof record.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `task_id` - Identifier symbol of the task.
    /// * `output_hash` - The 32-byte SHA-256 hash to verify against.
    ///
    /// # Returns
    /// * `bool` - `true` if the hashes match and verification succeeded; `false` otherwise.
    pub fn verify_proof(env: Env, task_id: Symbol, output_hash: BytesN<32>) -> bool {
        let key = DataKey::Proof(task_id);
        let mut proof = read_proof(&env, &key);
        if proof.output_hash != output_hash {
            return false;
        }

        proof.verified = true;
        env.storage().persistent().set(&key, &proof);
        extend_persistent(&env, &key);
        true
    }

    /// Retrieves the full `TaskProof` struct for a given task ID.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `task_id` - Identifier symbol of the task.
    pub fn get_proof(env: Env, task_id: Symbol) -> TaskProof {
        read_proof(&env, &DataKey::Proof(task_id))
    }

    /// Checks if a task has a proof that has been marked as verified.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `task_id` - Identifier symbol of the task.
    pub fn is_verified(env: Env, task_id: Symbol) -> bool {
        match env.storage().persistent().get::<_, TaskProof>(&DataKey::Proof(task_id)) {
            Some(proof) => proof.verified,
            None => false,
        }
    }

    /// Checks whether any proof has been submitted for a task ID.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `task_id` - Identifier symbol of the task.
    pub fn proof_exists(env: Env, task_id: Symbol) -> bool {
        env.storage().persistent().has(&DataKey::Proof(task_id))
    }

    /// Retrieves all task IDs executed by a given agent ID.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `agent_id` - Identifier symbol of the agent.
    pub fn get_all_proofs_by_agent(env: Env, agent_id: Symbol) -> Vec<Symbol> {
        read_agent_proofs(&env, &DataKey::AgentProofs(agent_id))
    }

    // ------------------------------------------------------------------------
    // 3. Executor Access Control
    // ------------------------------------------------------------------------

    /// Authorizes a backend executor address to submit task execution proofs.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The contract administrator address.
    /// * `executor` - The executor address to authorize.
    pub fn authorize_executor(env: Env, admin: Address, executor: Address) {
        require_admin(&env, &admin);
        let mut executors = read_executors(&env);
        if !executors.contains(&executor) {
            executors.push_back(executor);
            env.storage().instance().set(&DataKey::Executors, &executors);
            extend_instance(&env);
        }
    }

    /// Revokes proof submission authorization from an executor address.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The contract administrator address.
    /// * `executor` - The executor address to revoke.
    pub fn revoke_executor(env: Env, admin: Address, executor: Address) {
        require_admin(&env, &admin);
        let executors = read_executors(&env);
        let mut updated = Vec::<Address>::new(&env);
        for item in executors.iter() {
            if item != executor {
                updated.push_back(item);
            }
        }
        env.storage().instance().set(&DataKey::Executors, &updated);
        extend_instance(&env);
    }

    /// Checks whether an address is an authorized executor.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `executor` - The address to query.
    pub fn is_authorized_executor(env: Env, executor: Address) -> bool {
        read_executors(&env).contains(&executor)
    }

    // ------------------------------------------------------------------------
    // 4. Governance & Contract Upgrades
    // ------------------------------------------------------------------------

    /// Upgrades the contract WASM bytecode to a new version.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The contract administrator address.
    /// * `new_wasm_hash` - The 32-byte SHA-256 hash of the installed WASM bytecode.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        require_admin(&env, &admin);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/// Verifies that the provided address matches the stored administrator address.
fn require_admin(env: &Env, admin: &Address) {
    let stored_admin = read_admin(env);
    if stored_admin != *admin {
        soroban_sdk::panic_with_error!(env, TaskProofError::Unauthorized);
    }
    admin.require_auth();
}

/// Retrieves the stored administrator address from instance storage.
fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&symbol_short!("ADMIN"))
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskProofError::Unauthorized))
}

/// Retrieves the list of authorized executor addresses from instance storage.
fn read_executors(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::Executors)
        .unwrap_or_else(|| Vec::<Address>::new(env))
}

/// Reads the list of task IDs executed by an agent from persistent storage.
fn read_agent_proofs(env: &Env, key: &DataKey) -> Vec<Symbol> {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| Vec::<Symbol>::new(env))
}

/// Reads a `TaskProof` record from persistent storage.
fn read_proof(env: &Env, key: &DataKey) -> TaskProof {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskProofError::ProofNotFound))
}

/// Extends the TTL for instance storage if within the threshold.
fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

/// Extends the TTL for persistent storage key if within the threshold.
fn extend_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

// ============================================================================
// Unit & Integration Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    /// Helper: generates a 32-byte test hash filled with a repeated byte seed.
    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    /// Test fixture: sets up an initialized contract environment with mock auth.
    fn setup() -> (Env, TaskProofContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let contract_id = env.register(TaskProofContract, ());
        let client = TaskProofContractClient::new(&env, &contract_id);
        client.init(&admin, &escrow);
        (env, client, admin, escrow)
    }

    #[test]
    fn submit_proof_success() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);

        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_1"),
            &hash(&env, 7),
            &Symbol::new(&env, "coding_agent"),
        );

        let proof = client.get_proof(&Symbol::new(&env, "task_1"));
        assert_eq!(proof.agent_id, Symbol::new(&env, "coding_agent"));
        assert_eq!(proof.output_hash, hash(&env, 7));
        assert!(!proof.verified);
    }

    #[test]
    fn submit_proof_duplicate_rejection() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_2"),
            &hash(&env, 3),
            &Symbol::new(&env, "github_agent"),
        );

        let duplicate = client.try_submit_proof(
            &executor,
            &Symbol::new(&env, "task_2"),
            &hash(&env, 3),
            &Symbol::new(&env, "github_agent"),
        );

        assert!(matches!(
            duplicate,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskProofError::ProofAlreadyExists as u32)
        ));
    }

    #[test]
    fn submit_proof_unauthorized_caller_rejection() {
        let (env, client, _admin, _escrow) = setup();
        let executor = Address::generate(&env);
        let result = client.try_submit_proof(
            &executor,
            &Symbol::new(&env, "task_3"),
            &hash(&env, 5),
            &Symbol::new(&env, "email_agent"),
        );

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskProofError::Unauthorized as u32)
        ));
    }

    #[test]
    fn verify_proof_returns_true_on_matching_hash() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_4"),
            &hash(&env, 11),
            &Symbol::new(&env, "browser_agent"),
        );

        assert!(client.verify_proof(&Symbol::new(&env, "task_4"), &hash(&env, 11)));
    }

    #[test]
    fn verify_proof_returns_false_on_mismatched_hash() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_5"),
            &hash(&env, 12),
            &Symbol::new(&env, "document_agent"),
        );

        assert!(!client.verify_proof(&Symbol::new(&env, "task_5"), &hash(&env, 13)));
    }

    #[test]
    fn is_verified_transitions_correctly() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_6"),
            &hash(&env, 14),
            &Symbol::new(&env, "websearch_agent"),
        );

        assert!(!client.is_verified(&Symbol::new(&env, "task_6")));
        assert!(client.verify_proof(&Symbol::new(&env, "task_6"), &hash(&env, 14)));
        assert!(client.is_verified(&Symbol::new(&env, "task_6")));
    }

    #[test]
    fn proof_exists_transitions_correctly() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        assert!(!client.proof_exists(&Symbol::new(&env, "task_7")));
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_7"),
            &hash(&env, 9),
            &Symbol::new(&env, "coding_agent"),
        );
        assert!(client.proof_exists(&Symbol::new(&env, "task_7")));
    }

    #[test]
    fn get_proof_returns_correct_struct() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_8"),
            &hash(&env, 15),
            &Symbol::new(&env, "email_agent"),
        );
        let proof = client.get_proof(&Symbol::new(&env, "task_8"));
        assert_eq!(proof.task_id, Symbol::new(&env, "task_8"));
        assert_eq!(proof.submitted_by, executor);
    }

    #[test]
    fn get_all_proofs_by_agent_returns_correct_list() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_9"),
            &hash(&env, 16),
            &Symbol::new(&env, "coding_agent"),
        );
        client.submit_proof(
            &executor,
            &Symbol::new(&env, "task_10"),
            &hash(&env, 17),
            &Symbol::new(&env, "coding_agent"),
        );

        let proofs = client.get_all_proofs_by_agent(&Symbol::new(&env, "coding_agent"));
        assert_eq!(proofs.len(), 2);
        assert!(proofs.contains(&Symbol::new(&env, "task_9")));
        assert!(proofs.contains(&Symbol::new(&env, "task_10")));
    }

    #[test]
    fn executor_revocation_prevents_further_submission() {
        let (env, client, admin, _escrow) = setup();
        let executor = Address::generate(&env);
        client.authorize_executor(&admin, &executor);
        client.revoke_executor(&admin, &executor);

        let result = client.try_submit_proof(
            &executor,
            &Symbol::new(&env, "task_11"),
            &hash(&env, 18),
            &Symbol::new(&env, "browser_agent"),
        );

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskProofError::Unauthorized as u32)
        ));
    }
}

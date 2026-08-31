//! # Execra Agent Registry Smart Contract
//!
//! The `AgentRegistryContract` serves as the authoritative on-chain registry for autonomous
//! execution agents in the Execra decentralized execution layer on Stellar Soroban.
//!
//! ## Key Capabilities
//! - **Agent Lifecycle Management**: Admin-governed registration, deactivation, and reactivation of agents.
//! - **Reputation Scoring**: Dynamic reputation tracking (+10 on successful task completion, -20 on failure/cancellation),
//!   bounded between a minimum of 0 and a maximum of 1,000.
//! - **Authorized Callers**: Role-based access control permitting verified contracts (such as `TaskEscrow`) to report execution outcomes.
//! - **Contract Upgradeability**: Admin-controlled WASM hash upgrade mechanism.
//! - **State Archival Protection**: Automatic Soroban TTL extension on instance and persistent storage keys.

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

/// Initial reputation score granted to newly registered agents.
const INITIAL_REPUTATION: u32 = 100;

/// Maximum reputation score cap for any agent.
const MAX_REPUTATION: u32 = 1000;

/// Reputation points added upon successful task execution.
const SUCCESS_INCREMENT: u32 = 10;

/// Reputation points subtracted upon task failure or cancellation.
const FAILURE_DECREMENT: u32 = 20;

/// Instance storage symbol for the administrator address.
const ADMIN_KEY: soroban_sdk::Symbol = symbol_short!("ADMIN");

// ============================================================================
// Data Types & Storage Keys
// ============================================================================

/// Represents an on-chain autonomous agent registered with Execra.
#[contracttype]
#[derive(Clone, Eq, PartialEq, Debug)]
pub struct Agent {
    /// Unique identifier symbol for the agent (e.g., `github_agent`, `coding_agent`).
    pub agent_id: Symbol,
    /// Category / type descriptor of the agent (e.g., `github`, `coding`, `browser`).
    pub agent_type: Symbol,
    /// Payout and control Stellar address associated with the agent.
    pub wallet_address: Address,
    /// Cumulative counter of successfully verified tasks completed by this agent.
    pub total_tasks_completed: u64,
    /// Cumulative counter of tasks cancelled or failed for this agent.
    pub total_tasks_cancelled: u64,
    /// Current reputation score (clamped between 0 and 1,000).
    pub reputation_score: u32,
    /// Operational status flag indicating whether the agent is accepting new tasks.
    pub is_active: bool,
    /// Ledger timestamp (Unix seconds) when the agent was first registered.
    pub registered_at: u64,
}

/// Storage keys for indexing contract state.
#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Persistent key storing `Agent` records, indexed by agent ID.
    Agent(Symbol),
    /// Instance key storing the list of contract addresses authorized to update agent reputation.
    AuthorizedCallers,
}

// ============================================================================
// Error Codes
// ============================================================================

/// Error codes returned by the Agent Registry contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AgentRegistryError {
    /// The contract has already been initialized with an admin address.
    AlreadyInitialized = 1,
    /// The caller is not authorized to execute this administrative or privileged action.
    Unauthorized = 2,
    /// An agent with the given `agent_id` is already registered.
    AgentAlreadyExists = 3,
    /// The requested `agent_id` does not exist in persistent storage.
    AgentNotFound = 4,
    /// The caller address has already been granted reputation update privileges.
    CallerAlreadyAuthorized = 5,
}

// ============================================================================
// Smart Contract Implementation
// ============================================================================

#[contract]
pub struct AgentRegistryContract;

#[contractimpl]
impl AgentRegistryContract {
    // ------------------------------------------------------------------------
    // 1. Initialization
    // ------------------------------------------------------------------------

    /// Initializes the Agent Registry contract with the specified admin address.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The Stellar address designated as the contract administrator.
    ///
    /// # Errors
    /// * `AgentRegistryError::AlreadyInitialized` - If the contract has already been initialized.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN_KEY) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&ADMIN_KEY, &admin);
        write_authorized_callers(&env, &Vec::<Address>::new(&env));
    }

    // ------------------------------------------------------------------------
    // 2. Agent Lifecycle Management
    // ------------------------------------------------------------------------

    /// Registers a new execution agent in the registry.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The admin address authorising the registration.
    /// * `agent_id` - Unique identifier symbol for the agent.
    /// * `agent_type` - Categorical symbol classifying agent workload (e.g. `coding`, `browser`).
    /// * `wallet_address` - The payout wallet address for the agent.
    ///
    /// # Errors
    /// * `AgentRegistryError::Unauthorized` - If the caller is not the admin.
    /// * `AgentRegistryError::AgentAlreadyExists` - If the agent ID is already registered.
    pub fn register_agent(
        env: Env,
        admin: Address,
        agent_id: Symbol,
        agent_type: Symbol,
        wallet_address: Address,
    ) {
        require_admin(&env, &admin);

        let key = DataKey::Agent(agent_id.clone());
        if env.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::AgentAlreadyExists);
        }

        let agent = Agent {
            agent_id: agent_id.clone(),
            agent_type,
            wallet_address,
            total_tasks_completed: 0,
            total_tasks_cancelled: 0,
            reputation_score: INITIAL_REPUTATION,
            is_active: true,
            registered_at: env.ledger().timestamp(),
        };

        write_agent(&env, &key, &agent);
        extend_instance(&env);
    }

    /// Deactivates an existing agent, preventing it from taking new tasks.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The contract administrator address.
    /// * `agent_id` - The identifier of the agent to deactivate.
    pub fn deactivate_agent(env: Env, admin: Address, agent_id: Symbol) {
        require_admin(&env, &admin);
        set_active_state(&env, agent_id, false);
    }

    /// Reactivates a previously deactivated agent.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The contract administrator address.
    /// * `agent_id` - The identifier of the agent to reactivate.
    pub fn reactivate_agent(env: Env, admin: Address, agent_id: Symbol) {
        require_admin(&env, &admin);
        set_active_state(&env, agent_id, true);
    }

    // ------------------------------------------------------------------------
    // 3. Reputation & Performance Tracking
    // ------------------------------------------------------------------------

    /// Updates the reputation and task counters for an agent following task outcome.
    ///
    /// On success:
    /// - `total_tasks_completed` is incremented by 1.
    /// - `reputation_score` increases by 10 (capped at `MAX_REPUTATION` = 1,000).
    ///
    /// On failure / cancellation:
    /// - `total_tasks_cancelled` is incremented by 1.
    /// - `reputation_score` decreases by 20 (floored at 0).
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `caller` - The authorized caller address (e.g., `TaskEscrow` contract).
    /// * `agent_id` - The identifier of the agent.
    /// * `success` - `true` if the task succeeded, `false` if cancelled or failed.
    ///
    /// # Errors
    /// * `AgentRegistryError::Unauthorized` - If the caller is not in `AuthorizedCallers`.
    /// * `AgentRegistryError::AgentNotFound` - If the agent is not registered.
    pub fn update_reputation(env: Env, caller: Address, agent_id: Symbol, success: bool) {
        caller.require_auth();
        if !Self::is_authorized(env.clone(), caller.clone()) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::Unauthorized);
        }

        let key = DataKey::Agent(agent_id);
        let mut agent = read_agent(&env, &key);

        apply_reputation_result(&mut agent, success);
        write_agent(&env, &key, &agent);
    }

    /// Fetches the full on-chain record of an agent.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `agent_id` - The identifier of the agent to query.
    ///
    /// # Errors
    /// * `AgentRegistryError::AgentNotFound` - If the agent record does not exist.
    pub fn get_agent(env: Env, agent_id: Symbol) -> Agent {
        read_agent(&env, &DataKey::Agent(agent_id))
    }

    /// Fetches only the current reputation score of an agent.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `agent_id` - The identifier of the agent.
    pub fn get_reputation(env: Env, agent_id: Symbol) -> u32 {
        Self::get_agent(env, agent_id).reputation_score
    }

    // ------------------------------------------------------------------------
    // 4. Access Control & Authorization
    // ------------------------------------------------------------------------

    /// Authorizes a caller address (e.g. `TaskEscrow`) to update agent reputation.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `admin` - The contract administrator address.
    /// * `caller` - The address to grant reputation-update privileges.
    ///
    /// # Errors
    /// * `AgentRegistryError::Unauthorized` - If caller is not admin.
    /// * `AgentRegistryError::CallerAlreadyAuthorized` - If already authorized.
    pub fn authorize_caller(env: Env, admin: Address, caller: Address) {
        require_admin(&env, &admin);

        let mut callers = read_authorized_callers(&env);
        if callers.contains(&caller) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::CallerAlreadyAuthorized);
        }

        callers.push_back(caller);
        write_authorized_callers(&env, &callers);
    }

    /// Checks whether an address is an authorized reputation updater.
    ///
    /// # Arguments
    /// * `env` - The Soroban execution environment.
    /// * `caller` - The address to verify.
    pub fn is_authorized(env: Env, caller: Address) -> bool {
        read_authorized_callers(&env).contains(&caller)
    }

    // ------------------------------------------------------------------------
    // 5. Governance & Contract Upgrades
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
        soroban_sdk::panic_with_error!(env, AgentRegistryError::Unauthorized);
    }
    admin.require_auth();
}

/// Retrieves the stored administrator address from instance storage.
fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&ADMIN_KEY)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AgentRegistryError::Unauthorized))
}

/// Retrieves the list of authorized callers from instance storage.
fn read_authorized_callers(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::AuthorizedCallers)
        .unwrap_or_else(|| Vec::<Address>::new(env))
}

/// Writes authorized reputation updaters and refreshes instance storage TTL.
fn write_authorized_callers(env: &Env, callers: &Vec<Address>) {
    env.storage()
        .instance()
        .set(&DataKey::AuthorizedCallers, callers);
    extend_instance(env);
}

/// Reads an `Agent` record from persistent storage.
fn read_agent(env: &Env, key: &DataKey) -> Agent {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AgentRegistryError::AgentNotFound))
}

/// Writes an agent record and refreshes its persistent storage TTL.
fn write_agent(env: &Env, key: &DataKey, agent: &Agent) {
    env.storage().persistent().set(key, agent);
    extend_persistent(env, key);
}

/// Applies bounded reputation and task-counter updates for a completed outcome.
fn apply_reputation_result(agent: &mut Agent, success: bool) {
    if success {
        agent.total_tasks_completed = agent.total_tasks_completed.saturating_add(1);
        agent.reputation_score = agent
            .reputation_score
            .saturating_add(SUCCESS_INCREMENT)
            .min(MAX_REPUTATION);
    } else {
        agent.total_tasks_cancelled = agent.total_tasks_cancelled.saturating_add(1);
        agent.reputation_score = agent.reputation_score.saturating_sub(FAILURE_DECREMENT);
    }
}

/// Updates the operational active state flag of an agent.
fn set_active_state(env: &Env, agent_id: Symbol, is_active: bool) {
    let key = DataKey::Agent(agent_id);
    let mut agent = read_agent(env, &key);
    agent.is_active = is_active;
    write_agent(env, &key, &agent);
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

    /// Test fixture: sets up an initialized contract environment with mock auth.
    fn setup() -> (Env, AgentRegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(AgentRegistryContract, ());
        let client = AgentRegistryContractClient::new(&env, &contract_id);
        client.init(&admin);

        (env, client, admin)
    }

    /// Helper: registers a standard agent for testing.
    fn register_default_agent(
        env: &Env,
        client: &AgentRegistryContractClient<'_>,
        admin: &Address,
        agent_id: &str,
        agent_type: &str,
    ) -> Address {
        let wallet = Address::generate(env);
        client.register_agent(
            admin,
            &Symbol::new(env, agent_id),
            &Symbol::new(env, agent_type),
            &wallet,
        );
        wallet
    }

    #[test]
    fn register_agent_success() {
        let (env, client, admin) = setup();
        let wallet = register_default_agent(&env, &client, &admin, "github_agent", "github");

        let agent = client.get_agent(&Symbol::new(&env, "github_agent"));
        assert_eq!(agent.wallet_address, wallet);
        assert_eq!(agent.agent_type, Symbol::new(&env, "github"));
        assert_eq!(agent.reputation_score, 100);
        assert!(agent.is_active);
    }

    #[test]
    fn register_agent_duplicate_rejection() {
        let (env, client, admin) = setup();
        let wallet = register_default_agent(&env, &client, &admin, "coding_agent", "coding");

        let duplicate = client.try_register_agent(
            &admin,
            &Symbol::new(&env, "coding_agent"),
            &Symbol::new(&env, "coding"),
            &wallet,
        );

        assert!(matches!(
            duplicate,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(AgentRegistryError::AgentAlreadyExists as u32)
        ));
    }

    #[test]
    fn update_reputation_increases_score_by_ten_on_success() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "email_agent", "email");
        let caller = Address::generate(&env);
        client.authorize_caller(&admin, &caller);

        client.update_reputation(&caller, &Symbol::new(&env, "email_agent"), &true);

        let agent = client.get_agent(&Symbol::new(&env, "email_agent"));
        assert_eq!(agent.reputation_score, 110);
        assert_eq!(agent.total_tasks_completed, 1);
    }

    #[test]
    fn update_reputation_decreases_score_by_twenty_on_failure() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "browser_agent", "browser");
        let caller = Address::generate(&env);
        client.authorize_caller(&admin, &caller);

        client.update_reputation(&caller, &Symbol::new(&env, "browser_agent"), &false);

        let agent = client.get_agent(&Symbol::new(&env, "browser_agent"));
        assert_eq!(agent.reputation_score, 80);
        assert_eq!(agent.total_tasks_cancelled, 1);
    }

    #[test]
    fn reputation_floor_at_zero() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "document_agent", "document");
        let caller = Address::generate(&env);
        client.authorize_caller(&admin, &caller);

        for _ in 0..10 {
            client.update_reputation(&caller, &Symbol::new(&env, "document_agent"), &false);
        }

        assert_eq!(
            client.get_reputation(&Symbol::new(&env, "document_agent")),
            0
        );
    }

    #[test]
    fn reputation_ceiling_at_one_thousand() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "websearch_agent", "websearch");
        let caller = Address::generate(&env);
        client.authorize_caller(&admin, &caller);

        for _ in 0..100 {
            client.update_reputation(&caller, &Symbol::new(&env, "websearch_agent"), &true);
        }

        assert_eq!(
            client.get_reputation(&Symbol::new(&env, "websearch_agent")),
            1000
        );
    }

    #[test]
    fn total_tasks_completed_increments_correctly() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "github_agent", "github");
        let caller = Address::generate(&env);
        client.authorize_caller(&admin, &caller);

        client.update_reputation(&caller, &Symbol::new(&env, "github_agent"), &true);
        client.update_reputation(&caller, &Symbol::new(&env, "github_agent"), &true);

        let agent = client.get_agent(&Symbol::new(&env, "github_agent"));
        assert_eq!(agent.total_tasks_completed, 2);
    }

    #[test]
    fn total_tasks_cancelled_increments_correctly() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "coding_agent", "coding");
        let caller = Address::generate(&env);
        client.authorize_caller(&admin, &caller);

        client.update_reputation(&caller, &Symbol::new(&env, "coding_agent"), &false);
        client.update_reputation(&caller, &Symbol::new(&env, "coding_agent"), &false);

        let agent = client.get_agent(&Symbol::new(&env, "coding_agent"));
        assert_eq!(agent.total_tasks_cancelled, 2);
    }

    #[test]
    fn unauthorized_caller_rejected_on_update_reputation() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "email_agent", "email");
        let unauthorized = Address::generate(&env);

        let result =
            client.try_update_reputation(&unauthorized, &Symbol::new(&env, "email_agent"), &true);

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(AgentRegistryError::Unauthorized as u32)
        ));
    }

    #[test]
    fn deactivate_and_reactivate_agent_toggle_correctly() {
        let (env, client, admin) = setup();
        register_default_agent(&env, &client, &admin, "browser_agent", "browser");

        client.deactivate_agent(&admin, &Symbol::new(&env, "browser_agent"));
        assert!(
            !client
                .get_agent(&Symbol::new(&env, "browser_agent"))
                .is_active
        );

        client.reactivate_agent(&admin, &Symbol::new(&env, "browser_agent"));
        assert!(
            client
                .get_agent(&Symbol::new(&env, "browser_agent"))
                .is_active
        );
    }
}

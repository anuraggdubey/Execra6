#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    Symbol, Vec,
};

const INSTANCE_BUMP_THRESHOLD: u32 = 518_400;
const INSTANCE_BUMP_AMOUNT: u32 = 535_680;
const PERSISTENT_BUMP_THRESHOLD: u32 = 518_400;
const PERSISTENT_BUMP_AMOUNT: u32 = 535_680;
const INITIAL_REPUTATION: u32 = 100;
const MAX_REPUTATION: u32 = 1000;
const SUCCESS_INCREMENT: u32 = 10;
const FAILURE_DECREMENT: u32 = 20;

#[contracttype]
#[derive(Clone, Eq, PartialEq, Debug)]
pub struct Agent {
    pub agent_id: Symbol,
    pub agent_type: Symbol,
    pub wallet_address: Address,
    pub total_tasks_completed: u64,
    pub total_tasks_cancelled: u64,
    pub reputation_score: u32,
    pub is_active: bool,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Agent(Symbol),
    AuthorizedCallers,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AgentRegistryError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    AgentAlreadyExists = 3,
    AgentNotFound = 4,
    CallerAlreadyAuthorized = 5,
}

#[contract]
pub struct AgentRegistryContract;

#[contractimpl]
impl AgentRegistryContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&DataKey::AuthorizedCallers, &Vec::<Address>::new(&env));
        extend_instance(&env);
    }

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

        env.storage().persistent().set(&key, &agent);
        extend_persistent(&env, &key);
        extend_instance(&env);
    }

    pub fn update_reputation(env: Env, caller: Address, agent_id: Symbol, success: bool) {
        caller.require_auth();
        if !Self::is_authorized(env.clone(), caller.clone()) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::Unauthorized);
        }

        let key = DataKey::Agent(agent_id);
        let mut agent = read_agent(&env, &key);

        if success {
            agent.total_tasks_completed = agent.total_tasks_completed.saturating_add(1);
            agent.reputation_score = (agent.reputation_score.saturating_add(SUCCESS_INCREMENT)).min(MAX_REPUTATION);
        } else {
            agent.total_tasks_cancelled = agent.total_tasks_cancelled.saturating_add(1);
            agent.reputation_score = agent.reputation_score.saturating_sub(FAILURE_DECREMENT);
        }

        env.storage().persistent().set(&key, &agent);
        extend_persistent(&env, &key);
    }

    pub fn get_agent(env: Env, agent_id: Symbol) -> Agent {
        read_agent(&env, &DataKey::Agent(agent_id))
    }

    pub fn get_reputation(env: Env, agent_id: Symbol) -> u32 {
        Self::get_agent(env, agent_id).reputation_score
    }

    pub fn deactivate_agent(env: Env, admin: Address, agent_id: Symbol) {
        require_admin(&env, &admin);
        set_active_state(&env, agent_id, false);
    }

    pub fn reactivate_agent(env: Env, admin: Address, agent_id: Symbol) {
        require_admin(&env, &admin);
        set_active_state(&env, agent_id, true);
    }

    pub fn authorize_caller(env: Env, admin: Address, caller: Address) {
        require_admin(&env, &admin);

        let mut callers = read_authorized_callers(&env);
        if callers.contains(&caller) {
            soroban_sdk::panic_with_error!(&env, AgentRegistryError::CallerAlreadyAuthorized);
        }

        callers.push_back(caller);
        env.storage()
            .instance()
            .set(&DataKey::AuthorizedCallers, &callers);
        extend_instance(&env);
    }

    pub fn is_authorized(env: Env, caller: Address) -> bool {
        read_authorized_callers(&env).contains(&caller)
    }

    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        require_admin(&env, &admin);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

fn require_admin(env: &Env, admin: &Address) {
    let stored_admin = read_admin(env);
    if stored_admin != *admin {
        soroban_sdk::panic_with_error!(env, AgentRegistryError::Unauthorized);
    }
    admin.require_auth();
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&symbol_short!("ADMIN"))
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AgentRegistryError::Unauthorized))
}

fn read_authorized_callers(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::AuthorizedCallers)
        .unwrap_or_else(|| Vec::<Address>::new(env))
}

fn read_agent(env: &Env, key: &DataKey) -> Agent {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, AgentRegistryError::AgentNotFound))
}

fn set_active_state(env: &Env, agent_id: Symbol, is_active: bool) {
    let key = DataKey::Agent(agent_id);
    let mut agent = read_agent(env, &key);
    agent.is_active = is_active;
    env.storage().persistent().set(&key, &agent);
    extend_persistent(env, &key);
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn extend_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, AgentRegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(AgentRegistryContract, ());
        let client = AgentRegistryContractClient::new(&env, &contract_id);
        client.init(&admin);

        (env, client, admin)
    }

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

        assert_eq!(client.get_reputation(&Symbol::new(&env, "document_agent")), 0);
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

        assert_eq!(client.get_reputation(&Symbol::new(&env, "websearch_agent")), 1000);
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

        let result = client.try_update_reputation(&unauthorized, &Symbol::new(&env, "email_agent"), &true);

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
        assert!(!client.get_agent(&Symbol::new(&env, "browser_agent")).is_active);

        client.reactivate_agent(&admin, &Symbol::new(&env, "browser_agent"));
        assert!(client.get_agent(&Symbol::new(&env, "browser_agent")).is_active);
    }
}

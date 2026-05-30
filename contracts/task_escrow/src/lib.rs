#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, log, symbol_short, token, Address, BytesN,
    Env, IntoVal, InvokeError, Symbol, Val, Vec,
};

const INSTANCE_BUMP_THRESHOLD: u32 = 518_400;
const INSTANCE_BUMP_AMOUNT: u32 = 535_680;
const PERSISTENT_BUMP_THRESHOLD: u32 = 518_400;
const PERSISTENT_BUMP_AMOUNT: u32 = 535_680;

#[contracttype]
#[derive(Clone, Eq, PartialEq, Debug)]
pub enum TaskStatus {
    Pending = 0,
    Completed = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Eq, PartialEq, Debug)]
pub struct Task {
    pub task_id: Symbol,
    pub user: Address,
    pub agent_type: Symbol,
    pub reward: i128,
    pub status: TaskStatus,
}

#[contracttype]
enum DataKey {
    Token,
    Registry,
    ProofContract,
    Executors(Address),
    Balance(Address),
    PendingTasks(Address),
    Task(Symbol),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TaskEscrowError {
    AlreadyInitialized = 1,
    TaskAlreadyExists = 2,
    TaskNotFound = 3,
    InvalidReward = 4,
    Unauthorized = 5,
    InvalidTaskState = 6,
    ExecutorRequired = 7,
    ProofRequired = 8,
    ProofVerificationFailed = 9,
    InsufficientBalance = 10,
    ActiveTasksPending = 11,
}

#[contract]
pub struct TaskEscrowContract;

#[contractimpl]
impl TaskEscrowContract {
    pub fn init(env: Env, admin: Address, token_contract: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&DataKey::Token, &token_contract);
        extend_instance(&env);
    }

    pub fn set_executor(env: Env, executor: Address, allowed: bool) {
        let admin = read_admin(&env);
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Executors(executor.clone()), &allowed);
        extend_persistent(&env, &DataKey::Executors(executor));
    }

    pub fn set_registry(env: Env, admin: Address, registry_contract: Address) {
        require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Registry, &registry_contract);
        extend_instance(&env);
    }

    pub fn set_proof_contract(env: Env, admin: Address, proof_contract: Address) {
        require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ProofContract, &proof_contract);
        extend_instance(&env);
    }

    pub fn is_executor(env: Env, executor: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Executors(executor))
            .unwrap_or(false)
    }

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        ensure_positive_reward(&env, amount);

        token_client(&env).transfer(&user, &env.current_contract_address(), &amount);
        set_balance(&env, &user, read_balance(&env, &user) + amount);
        extend_instance(&env);
    }

    pub fn withdraw(env: Env, user: Address, amount: i128) {
        user.require_auth();
        ensure_positive_reward(&env, amount);

        if read_pending_tasks(&env, &user) > 0 {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::ActiveTasksPending);
        }

        let balance = read_balance(&env, &user);
        if balance < amount {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::InsufficientBalance);
        }

        set_balance(&env, &user, balance - amount);
        token_client(&env).transfer(&env.current_contract_address(), &user, &amount);
        extend_instance(&env);
    }

    pub fn get_balance(env: Env, user: Address) -> i128 {
        read_balance(&env, &user)
    }

    pub fn create_task(env: Env, task_id: Symbol, user: Address, agent_type: Symbol, reward: i128) {
        read_admin(&env).require_auth();
        ensure_positive_reward(&env, reward);

        let key = DataKey::Task(task_id.clone());
        if env.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::TaskAlreadyExists);
        }

        let balance = read_balance(&env, &user);
        if balance < reward {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::InsufficientBalance);
        }

        let task = Task {
            task_id,
            user: user.clone(),
            agent_type,
            reward,
            status: TaskStatus::Pending,
        };

        set_balance(&env, &user, balance - reward);
        set_pending_tasks(&env, &user, read_pending_tasks(&env, &user) + 1);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
        extend_instance(&env);
    }

    pub fn complete_task(
        env: Env,
        task_id: Symbol,
        caller: Address,
        pay_executor: bool,
        output_hash: BytesN<32>,
    ) {
        let key = DataKey::Task(task_id.clone());
        let mut task = read_task(&env, &key);
        ensure_pending(&env, &task);
        caller.require_auth();

        let is_task_owner = caller == task.user;
        let is_executor = Self::is_executor(env.clone(), caller.clone());

        if pay_executor {
            if !is_executor {
                soroban_sdk::panic_with_error!(&env, TaskEscrowError::ExecutorRequired);
            }
        } else if !is_task_owner && !is_executor {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::Unauthorized);
        }

        require_proof_exists(&env, &task.task_id);
        let recipient = if pay_executor {
            caller
        } else {
            task.user.clone()
        };

        task.status = TaskStatus::Completed;
        token_client(&env).transfer(&env.current_contract_address(), &recipient, &task.reward);
        decrement_pending_tasks(&env, &task.user);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
        verify_proof_or_panic(&env, &task.task_id, &output_hash);
        notify_registry(&env, &task.agent_type, true);
    }

    pub fn cancel_task(env: Env, task_id: Symbol, caller: Address) {
        let key = DataKey::Task(task_id);
        let mut task = read_task(&env, &key);
        ensure_pending(&env, &task);
        if caller != task.user {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::Unauthorized);
        }
        caller.require_auth();

        task.status = TaskStatus::Cancelled;
        set_balance(
            &env,
            &task.user,
            read_balance(&env, &task.user) + task.reward,
        );
        decrement_pending_tasks(&env, &task.user);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
        notify_registry(&env, &task.agent_type, false);
    }

    pub fn get_task(env: Env, task_id: Symbol) -> Task {
        read_task(&env, &DataKey::Task(task_id))
    }

    pub fn get_admin(env: Env) -> Address {
        read_admin(&env)
    }

    pub fn get_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| soroban_sdk::panic_with_error!(&env, TaskEscrowError::Unauthorized))
    }

    pub fn get_registry(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Registry)
    }

    pub fn get_proof_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::ProofContract)
    }

    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        require_admin(&env, &admin);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

fn require_admin(env: &Env, admin: &Address) {
    let stored_admin = read_admin(env);
    if stored_admin != *admin {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::Unauthorized);
    }

    admin.require_auth();
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&symbol_short!("ADMIN"))
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::Unauthorized))
}

fn read_task(env: &Env, key: &DataKey) -> Task {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::TaskNotFound))
}

fn read_balance(env: &Env, user: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(user.clone()))
        .unwrap_or(0)
}

fn set_balance(env: &Env, user: &Address, balance: i128) {
    let key = DataKey::Balance(user.clone());
    env.storage().persistent().set(&key, &balance);
    extend_persistent(env, &key);
}

fn read_pending_tasks(env: &Env, user: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::PendingTasks(user.clone()))
        .unwrap_or(0)
}

fn set_pending_tasks(env: &Env, user: &Address, pending_tasks: i128) {
    let key = DataKey::PendingTasks(user.clone());
    env.storage().persistent().set(&key, &pending_tasks);
    extend_persistent(env, &key);
}

fn decrement_pending_tasks(env: &Env, user: &Address) {
    let pending_tasks = read_pending_tasks(env, user);
    set_pending_tasks(env, user, pending_tasks.saturating_sub(1));
}

fn require_proof_exists(env: &Env, task_id: &Symbol) {
    let proof_contract = env
        .storage()
        .instance()
        .get::<_, Address>(&DataKey::ProofContract)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::ProofRequired));

    let exists: bool = env.invoke_contract(
        &proof_contract,
        &Symbol::new(env, "proof_exists"),
        Vec::from_array(env, [task_id.clone().into_val(env)]),
    );

    if !exists {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::ProofRequired);
    }
}

fn verify_proof_or_panic(env: &Env, task_id: &Symbol, output_hash: &BytesN<32>) {
    let proof_contract = env
        .storage()
        .instance()
        .get::<_, Address>(&DataKey::ProofContract)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::ProofRequired));

    let verified: bool = env.invoke_contract(
        &proof_contract,
        &Symbol::new(env, "verify_proof"),
        Vec::from_array(
            env,
            [
                task_id.clone().into_val(env),
                output_hash.clone().into_val(env),
            ],
        ),
    );

    if !verified {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::ProofVerificationFailed);
    }
}

fn ensure_positive_reward(env: &Env, reward: i128) {
    if reward <= 0 {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::InvalidReward);
    }
}

fn ensure_pending(env: &Env, task: &Task) {
    if task.status != TaskStatus::Pending {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::InvalidTaskState);
    }
}

fn token_client<'a>(env: &'a Env) -> token::Client<'a> {
    let token_address = env
        .storage()
        .instance()
        .get::<_, Address>(&DataKey::Token)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::Unauthorized));
    token::Client::new(env, &token_address)
}

fn notify_registry(env: &Env, agent_type: &Symbol, success: bool) {
    let Some(registry_address) = env
        .storage()
        .instance()
        .get::<_, Address>(&DataKey::Registry)
    else {
        return;
    };

    let update_symbol = Symbol::new(env, "update_reputation");
    let caller = env.current_contract_address();
    let agent_id = map_agent_type_to_id(env, agent_type);
    let args: Vec<Val> = Vec::from_array(
        env,
        [
            caller.into_val(env),
            agent_id.into_val(env),
            success.into_val(env),
        ],
    );

    if env
        .try_invoke_contract::<(), InvokeError>(&registry_address, &update_symbol, args)
        .is_err()
    {
        log!(env, "agent registry update failed");
    }
}

fn map_agent_type_to_id(env: &Env, agent_type: &Symbol) -> Symbol {
    if *agent_type == Symbol::new(env, "github") {
        Symbol::new(env, "github_agent")
    } else if *agent_type == Symbol::new(env, "coding") {
        Symbol::new(env, "coding_agent")
    } else if *agent_type == Symbol::new(env, "document") {
        Symbol::new(env, "document_agent")
    } else if *agent_type == Symbol::new(env, "email") {
        Symbol::new(env, "email_agent")
    } else if *agent_type == Symbol::new(env, "websearch")
        || *agent_type == Symbol::new(env, "search")
    {
        Symbol::new(env, "websearch_agent")
    } else if *agent_type == Symbol::new(env, "browser") {
        Symbol::new(env, "browser_agent")
    } else {
        Symbol::new(env, "unknown_agent")
    }
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
    use agent_registry::{AgentRegistryContract, AgentRegistryContractClient};
    use soroban_sdk::{testutils::Address as _, token};
    use task_proof::{TaskProofContract, TaskProofContractClient};

    #[contracterror]
    #[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
    #[repr(u32)]
    enum FailingRegistryError {
        AlwaysFails = 1,
    }

    #[contract]
    struct FailingRegistryContract;

    #[contractimpl]
    impl FailingRegistryContract {
        pub fn update_reputation(_env: Env, _caller: Address, _agent_id: Symbol, _success: bool) {
            soroban_sdk::panic_with_error!(&_env, FailingRegistryError::AlwaysFails);
        }
    }

    fn task_symbol(env: &Env, value: &str) -> Symbol {
        Symbol::new(env, value)
    }

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn setup() -> (
        Env,
        TaskEscrowContractClient<'static>,
        Address,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_address = sac.address();
        let sac_admin = token::StellarAssetClient::new(&env, &sac_address);
        sac_admin.mint(&user, &10_000_000i128);

        let contract_id = env.register(TaskEscrowContract, ());
        let client = TaskEscrowContractClient::new(&env, &contract_id);
        client.init(&admin, &sac_address);

        (env, client, admin, user, sac_address, contract_id)
    }

    fn setup_registry(
        env: &Env,
        admin: &Address,
        escrow_contract_id: &Address,
    ) -> (AgentRegistryContractClient<'static>, Address) {
        let registry_id = env.register(AgentRegistryContract, ());
        let registry = AgentRegistryContractClient::new(env, &registry_id);
        registry.init(admin);
        registry.authorize_caller(admin, escrow_contract_id);
        registry.register_agent(
            admin,
            &Symbol::new(env, "coding_agent"),
            &Symbol::new(env, "coding"),
            &Address::generate(env),
        );
        registry.register_agent(
            admin,
            &Symbol::new(env, "browser_agent"),
            &Symbol::new(env, "browser"),
            &Address::generate(env),
        );
        registry.register_agent(
            admin,
            &Symbol::new(env, "websearch_agent"),
            &Symbol::new(env, "websearch"),
            &Address::generate(env),
        );
        (registry, registry_id)
    }

    fn setup_proof_contract(
        env: &Env,
        admin: &Address,
        escrow_contract_id: &Address,
    ) -> (TaskProofContractClient<'static>, Address, Address) {
        let proof_id = env.register(TaskProofContract, ());
        let proof = TaskProofContractClient::new(env, &proof_id);
        let backend_executor = Address::generate(env);
        proof.init(admin, escrow_contract_id);
        proof.authorize_executor(admin, &backend_executor);
        (proof, proof_id, backend_executor)
    }

    fn deposit_for_task(client: &TaskEscrowContractClient<'static>, user: &Address, reward: i128) {
        client.deposit(user, &reward);
    }

    #[test]
    fn deposit_adds_to_platform_balance() {
        let (_env, client, _admin, user, _sac_address, _escrow_id) = setup();

        client.deposit(&user, &1_500_000i128);

        assert_eq!(client.get_balance(&user), 1_500_000i128);
    }

    #[test]
    fn withdraw_returns_xlm_to_wallet() {
        let (_env, client, _admin, user, sac_address, _escrow_id) = setup();
        let token_client = token::Client::new(&_env, &sac_address);

        client.deposit(&user, &2_000_000i128);
        client.withdraw(&user, &750_000i128);

        assert_eq!(client.get_balance(&user), 1_250_000i128);
        assert_eq!(token_client.balance(&user), 8_750_000i128);
    }

    #[test]
    fn withdraw_fails_if_amount_exceeds_balance() {
        let (_env, client, _admin, user, _sac_address, _escrow_id) = setup();

        client.deposit(&user, &500_000i128);
        let result = client.try_withdraw(&user, &600_000i128);

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskEscrowError::InsufficientBalance as u32)
        ));
    }

    #[test]
    fn withdraw_fails_with_active_pending_task() {
        let (env, client, _admin, user, _sac_address, _escrow_id) = setup();

        client.deposit(&user, &1_000_000i128);
        client.create_task(
            &task_symbol(&env, "task_blocks_withdraw"),
            &user,
            &Symbol::new(&env, "coding"),
            &500_000i128,
        );
        let result = client.try_withdraw(&user, &500_000i128);

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskEscrowError::ActiveTasksPending as u32)
        ));
    }

    #[test]
    fn creates_email_task_with_pending_status() {
        let (env, client, _admin, user, _sac_address, _escrow_id) = setup();
        deposit_for_task(&client, &user, 1_000_000i128);

        client.create_task(
            &task_symbol(&env, "task_email"),
            &user,
            &Symbol::new(&env, "email"),
            &1_000_000i128,
        );

        let task = client.get_task(&task_symbol(&env, "task_email"));
        assert_eq!(task.agent_type, Symbol::new(&env, "email"));
        assert_eq!(task.reward, 1_000_000i128);
        assert_eq!(task.status, TaskStatus::Pending);
        assert_eq!(client.get_balance(&user), 0i128);
    }

    #[test]
    fn creates_search_task_with_pending_status() {
        let (env, client, _admin, user, _sac_address, _escrow_id) = setup();
        deposit_for_task(&client, &user, 800_000i128);

        client.create_task(
            &task_symbol(&env, "task_search"),
            &user,
            &Symbol::new(&env, "search"),
            &800_000i128,
        );

        let task = client.get_task(&task_symbol(&env, "task_search"));
        assert_eq!(task.agent_type, Symbol::new(&env, "search"));
        assert_eq!(task.status, TaskStatus::Pending);
        assert_eq!(client.get_balance(&user), 0i128);
    }

    #[test]
    fn create_task_fails_if_balance_too_low() {
        let (env, client, _admin, user, _sac_address, _escrow_id) = setup();

        client.deposit(&user, &400_000i128);
        let result = client.try_create_task(
            &task_symbol(&env, "task_low_balance"),
            &user,
            &Symbol::new(&env, "search"),
            &800_000i128,
        );

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskEscrowError::InsufficientBalance as u32)
        ));
        assert_eq!(client.get_balance(&user), 400_000i128);
    }

    #[test]
    fn completes_task_and_returns_reward() {
        let (env, client, admin, user, sac_address, escrow_id) = setup();
        let token_client = token::Client::new(&env, &sac_address);
        let (proof, proof_id, backend_executor) = setup_proof_contract(&env, &admin, &escrow_id);
        client.set_proof_contract(&admin, &proof_id);
        deposit_for_task(&client, &user, 1_000_000i128);

        client.create_task(
            &task_symbol(&env, "task_complete"),
            &user,
            &Symbol::new(&env, "coding"),
            &1_000_000i128,
        );
        proof.submit_proof(
            &backend_executor,
            &task_symbol(&env, "task_complete"),
            &hash(&env, 1),
            &Symbol::new(&env, "coding_agent"),
        );

        client.complete_task(
            &task_symbol(&env, "task_complete"),
            &user,
            &false,
            &hash(&env, 1),
        );

        let task = client.get_task(&task_symbol(&env, "task_complete"));
        assert_eq!(task.status, TaskStatus::Completed);
        assert_eq!(token_client.balance(&user), 10_000_000i128);
    }

    #[test]
    fn cancels_task_and_returns_reward() {
        let (env, client, _admin, user, sac_address, _escrow_id) = setup();
        let token_client = token::Client::new(&env, &sac_address);
        deposit_for_task(&client, &user, 1_000_000i128);

        client.create_task(
            &task_symbol(&env, "task_cancel"),
            &user,
            &Symbol::new(&env, "browser"),
            &1_000_000i128,
        );
        client.cancel_task(&task_symbol(&env, "task_cancel"), &user);

        let task = client.get_task(&task_symbol(&env, "task_cancel"));
        assert_eq!(task.status, TaskStatus::Cancelled);
        assert_eq!(client.get_balance(&user), 1_000_000i128);
        assert_eq!(token_client.balance(&user), 9_000_000i128);
    }

    #[test]
    fn complete_task_triggers_reputation_update() {
        let (env, client, admin, user, _sac_address, escrow_id) = setup();
        let (registry, registry_id) = setup_registry(&env, &admin, &escrow_id);
        client.set_registry(&admin, &registry_id);
        let (proof, proof_id, backend_executor) = setup_proof_contract(&env, &admin, &escrow_id);
        client.set_proof_contract(&admin, &proof_id);
        deposit_for_task(&client, &user, 500_000i128);

        client.create_task(
            &task_symbol(&env, "task_reputation_complete"),
            &user,
            &Symbol::new(&env, "coding"),
            &500_000i128,
        );
        proof.submit_proof(
            &backend_executor,
            &task_symbol(&env, "task_reputation_complete"),
            &hash(&env, 2),
            &Symbol::new(&env, "coding_agent"),
        );

        client.complete_task(
            &task_symbol(&env, "task_reputation_complete"),
            &user,
            &false,
            &hash(&env, 2),
        );

        let agent = registry.get_agent(&Symbol::new(&env, "coding_agent"));
        assert_eq!(agent.total_tasks_completed, 1);
        assert_eq!(agent.reputation_score, 110);
    }

    #[test]
    fn cancel_task_triggers_reputation_penalty() {
        let (env, client, admin, user, _sac_address, escrow_id) = setup();
        let (registry, registry_id) = setup_registry(&env, &admin, &escrow_id);
        client.set_registry(&admin, &registry_id);
        deposit_for_task(&client, &user, 500_000i128);

        client.create_task(
            &task_symbol(&env, "task_reputation_cancel"),
            &user,
            &Symbol::new(&env, "browser"),
            &500_000i128,
        );
        client.cancel_task(&task_symbol(&env, "task_reputation_cancel"), &user);

        let agent = registry.get_agent(&Symbol::new(&env, "browser_agent"));
        assert_eq!(agent.total_tasks_cancelled, 1);
        assert_eq!(agent.reputation_score, 80);
    }

    #[test]
    fn payment_still_releases_even_if_registry_call_fails() {
        let (env, client, admin, user, sac_address, escrow_id) = setup();
        let token_client = token::Client::new(&env, &sac_address);
        let failing_registry_id = env.register(FailingRegistryContract, ());
        client.set_registry(&admin, &failing_registry_id);
        let (proof, proof_id, backend_executor) = setup_proof_contract(&env, &admin, &escrow_id);
        client.set_proof_contract(&admin, &proof_id);
        deposit_for_task(&client, &user, 1_000_000i128);

        client.create_task(
            &task_symbol(&env, "task_registry_fail"),
            &user,
            &Symbol::new(&env, "coding"),
            &1_000_000i128,
        );
        proof.submit_proof(
            &backend_executor,
            &task_symbol(&env, "task_registry_fail"),
            &hash(&env, 3),
            &Symbol::new(&env, "coding_agent"),
        );

        client.complete_task(
            &task_symbol(&env, "task_registry_fail"),
            &user,
            &false,
            &hash(&env, 3),
        );

        let task = client.get_task(&task_symbol(&env, "task_registry_fail"));
        assert_eq!(task.status, TaskStatus::Completed);
        assert_eq!(token_client.balance(&user), 10_000_000i128);
    }

    #[test]
    fn complete_task_fails_if_no_proof_submitted() {
        let (env, client, admin, user, _sac_address, escrow_id) = setup();
        let (_proof, proof_id, _backend_executor) = setup_proof_contract(&env, &admin, &escrow_id);
        client.set_proof_contract(&admin, &proof_id);
        deposit_for_task(&client, &user, 500_000i128);

        client.create_task(
            &task_symbol(&env, "task_needs_proof"),
            &user,
            &Symbol::new(&env, "coding"),
            &500_000i128,
        );

        let result = client.try_complete_task(
            &task_symbol(&env, "task_needs_proof"),
            &user,
            &false,
            &hash(&env, 4),
        );

        assert!(matches!(
            result,
            Err(Ok(error)) if error == soroban_sdk::Error::from_contract_error(TaskEscrowError::ProofRequired as u32)
        ));
    }

    #[test]
    fn complete_task_succeeds_after_proof_submitted_and_marks_verified() {
        let (env, client, admin, user, _sac_address, escrow_id) = setup();
        let (proof, proof_id, backend_executor) = setup_proof_contract(&env, &admin, &escrow_id);
        client.set_proof_contract(&admin, &proof_id);
        deposit_for_task(&client, &user, 500_000i128);

        client.create_task(
            &task_symbol(&env, "task_verified"),
            &user,
            &Symbol::new(&env, "coding"),
            &500_000i128,
        );
        proof.submit_proof(
            &backend_executor,
            &task_symbol(&env, "task_verified"),
            &hash(&env, 5),
            &Symbol::new(&env, "coding_agent"),
        );

        client.complete_task(
            &task_symbol(&env, "task_verified"),
            &user,
            &false,
            &hash(&env, 5),
        );

        assert!(proof.is_verified(&task_symbol(&env, "task_verified")));
    }
}

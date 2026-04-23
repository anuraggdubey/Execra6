#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol, Vec};

const INSTANCE_BUMP_THRESHOLD: u32 = 518_400;
const INSTANCE_BUMP_AMOUNT: u32 = 535_680;
const PERSISTENT_BUMP_THRESHOLD: u32 = 518_400;
const PERSISTENT_BUMP_AMOUNT: u32 = 535_680;

#[contracttype]
#[derive(Clone, Eq, PartialEq)]
pub enum TaskStatus {
    Pending = 0,
    Completed = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Task {
    pub task_id: u64,
    pub user: Address,
    pub agent_type: Symbol,
    pub reward: i128,
    pub status: TaskStatus,
    pub settlement_method: Symbol,
    pub approval_mode: Symbol,
    pub required_approvals: u32,
    pub approval_count: u32,
    pub auth_mode: Symbol,
    pub smart_wallet: Address,
    pub approvers: Vec<Address>,
}

#[contracttype]
enum DataKey {
    Admin,
    Token,
    Executors(Address),
    SmartWallet(Address),
    SmartWalletPolicy(Address),
    Task(u64),
    Approval(u64, Address),
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
    InvalidApprovalConfig = 8,
    SmartWalletRequired = 9,
    ApproverRequired = 10,
}

#[contract]
pub struct TaskEscrowContract;

#[contractimpl]
impl TaskEscrowContract {
    pub fn init(env: Env, admin: Address, token_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token_contract);
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

    pub fn is_executor(env: Env, executor: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Executors(executor))
            .unwrap_or(false)
    }

    pub fn set_smart_wallet(env: Env, owner: Address, smart_wallet: Address, auth_policy: Symbol) {
        owner.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::SmartWallet(owner.clone()), &smart_wallet);
        env.storage()
            .persistent()
            .set(&DataKey::SmartWalletPolicy(owner.clone()), &auth_policy);
        extend_persistent(&env, &DataKey::SmartWallet(owner.clone()));
        extend_persistent(&env, &DataKey::SmartWalletPolicy(owner));
    }

    pub fn get_smart_wallet(env: Env, owner: Address) -> Option<Address> {
        env.storage().persistent().get(&DataKey::SmartWallet(owner))
    }

    pub fn create_task(
        env: Env,
        task_id: u64,
        user: Address,
        agent_type: Symbol,
        reward: i128,
        settlement_method: Symbol,
        approval_mode: Symbol,
        required_approvals: u32,
        auth_mode: Symbol,
        smart_wallet: Address,
        approvers: Vec<Address>,
    ) {
        user.require_auth();
        ensure_positive_reward(&env, reward);
        validate_approval_config(&env, &approval_mode, required_approvals, &approvers);

        let key = DataKey::Task(task_id);
        if env.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::TaskAlreadyExists);
        }

        let resolved_smart_wallet = resolve_smart_wallet(&env, &user, &auth_mode, smart_wallet);

        let task = Task {
            task_id,
            user: user.clone(),
            agent_type,
            reward,
            status: TaskStatus::Pending,
            settlement_method,
            approval_mode,
            required_approvals,
            approval_count: 0,
            auth_mode,
            smart_wallet: resolved_smart_wallet,
            approvers,
        };

        token_client(&env).transfer(&user, &env.current_contract_address(), &reward);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
        extend_instance(&env);
    }

    pub fn approve_task(env: Env, task_id: u64, approver: Address) {
        let key = DataKey::Task(task_id);
        let mut task = read_task(&env, &key);
        ensure_pending(&env, &task);
        approver.require_auth();

        if !is_multisig(&env, &task.approval_mode) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::InvalidApprovalConfig);
        }

        if !contains_approver(&task.approvers, &approver) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::ApproverRequired);
        }

        let approval_key = DataKey::Approval(task_id, approver.clone());
        if env.storage().persistent().has(&approval_key) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::InvalidTaskState);
        }

        env.storage().persistent().set(&approval_key, &true);
        extend_persistent(&env, &approval_key);

        task.approval_count += 1;
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
    }

    pub fn complete_task(env: Env, task_id: u64, caller: Address, pay_executor: bool) {
        let key = DataKey::Task(task_id);
        let mut task = read_task(&env, &key);
        ensure_pending(&env, &task);
        caller.require_auth();
        ensure_approval_threshold(&env, &task);

        let is_task_owner = is_authorized_task_caller(&env, &task, &caller);
        let is_executor = Self::is_executor(env.clone(), caller.clone());

        if pay_executor {
            if !is_executor {
                soroban_sdk::panic_with_error!(&env, TaskEscrowError::ExecutorRequired);
            }
        } else if !is_task_owner && !is_executor {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::Unauthorized);
        }

        let recipient = if pay_executor { caller } else { task.user.clone() };

        task.status = TaskStatus::Completed;
        token_client(&env).transfer(&env.current_contract_address(), &recipient, &task.reward);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
    }

    pub fn cancel_task(env: Env, task_id: u64, caller: Address) {
        let key = DataKey::Task(task_id);
        let mut task = read_task(&env, &key);
        ensure_pending(&env, &task);
        if !is_authorized_task_caller(&env, &task, &caller) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::Unauthorized);
        }
        caller.require_auth();

        task.status = TaskStatus::Cancelled;
        token_client(&env).transfer(&env.current_contract_address(), &task.user, &task.reward);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
    }

    pub fn get_task(env: Env, task_id: u64) -> Task {
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
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::Unauthorized))
}

fn read_task(env: &Env, key: &DataKey) -> Task {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::TaskNotFound))
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

fn is_multisig(env: &Env, approval_mode: &Symbol) -> bool {
    *approval_mode == Symbol::new(env, "multisig")
}

fn is_smart_auth(env: &Env, auth_mode: &Symbol) -> bool {
    *auth_mode == Symbol::new(env, "smart")
}

fn contains_approver(approvers: &Vec<Address>, approver: &Address) -> bool {
    let mut index = 0;
    while index < approvers.len() {
        if approvers.get(index).unwrap() == *approver {
            return true;
        }
        index += 1;
    }

    false
}

fn validate_approval_config(env: &Env, approval_mode: &Symbol, required_approvals: u32, approvers: &Vec<Address>) {
    if is_multisig(env, approval_mode) {
        if approvers.len() < 2 || required_approvals < 2 || required_approvals > approvers.len() {
            soroban_sdk::panic_with_error!(env, TaskEscrowError::InvalidApprovalConfig);
        }
    } else if required_approvals != 1 {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::InvalidApprovalConfig);
    }
}

fn resolve_smart_wallet(env: &Env, user: &Address, auth_mode: &Symbol, requested: Address) -> Address {
    if !is_smart_auth(env, auth_mode) {
        return user.clone();
    }

    if requested != *user {
        return requested;
    }

    let stored: Option<Address> = env.storage().persistent().get(&DataKey::SmartWallet(user.clone()));
    if stored.is_none() {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::SmartWalletRequired);
    }

    stored.unwrap()
}

fn ensure_approval_threshold(env: &Env, task: &Task) {
    if is_multisig(env, &task.approval_mode) && task.approval_count < task.required_approvals {
        soroban_sdk::panic_with_error!(env, TaskEscrowError::InvalidTaskState);
    }
}

fn is_authorized_task_caller(env: &Env, task: &Task, caller: &Address) -> bool {
    if *caller == task.user {
        return true;
    }

    if !is_smart_auth(env, &task.auth_mode) {
        return false;
    }

    if *caller == task.smart_wallet {
        return true;
    }

    if let Some(stored_wallet) = TaskEscrowContract::get_smart_wallet(env.clone(), task.user.clone()) {
        return *caller == stored_wallet;
    }

    false
}

fn token_client(env: &Env) -> token::Client<'_> {
    let token_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskEscrowError::Unauthorized));
    token::Client::new(env, &token_address)
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
    use soroban_sdk::{testutils::Address as _, token, vec};

    fn setup() -> (Env, TaskEscrowContractClient<'static>, Address, Address, Address) {
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

        (env, client, admin, user, sac_address)
    }

    #[test]
    fn creates_email_task_with_pending_status() {
        let (env, client, _admin, user, sac_address) = setup();
        let token_client = token::Client::new(&env, &sac_address);
        let reward = 1_250_000i128;

        client.create_task(
            &1u64,
            &user,
            &Symbol::new(&env, "email"),
            &reward,
            &Symbol::new(&env, "wallet"),
            &Symbol::new(&env, "single"),
            &1u32,
            &Symbol::new(&env, "wallet"),
            &user,
            &vec![&env],
        );

        let task = client.get_task(&1u64);
        assert!(task.task_id == 1u64);
        assert!(task.user == user);
        assert!(task.agent_type == Symbol::new(&env, "email"));
        assert!(task.reward == reward);
        assert!(task.status == TaskStatus::Pending);
        assert!(token_client.balance(&user) == 8_750_000i128);
    }

    #[test]
    fn creates_search_task_with_pending_status() {
        let (env, client, _admin, user, sac_address) = setup();
        let token_client = token::Client::new(&env, &sac_address);
        let reward = 2_000_000i128;

        client.create_task(
            &2u64,
            &user,
            &Symbol::new(&env, "search"),
            &reward,
            &Symbol::new(&env, "sep24"),
            &Symbol::new(&env, "single"),
            &1u32,
            &Symbol::new(&env, "wallet"),
            &user,
            &vec![&env],
        );

        let task = client.get_task(&2u64);
        assert!(task.task_id == 2u64);
        assert!(task.user == user);
        assert!(task.agent_type == Symbol::new(&env, "search"));
        assert!(task.reward == reward);
        assert!(task.status == TaskStatus::Pending);
        assert!(task.settlement_method == Symbol::new(&env, "sep24"));
        assert!(token_client.balance(&user) == 8_000_000i128);
    }

    #[test]
    fn requires_multisig_approvals_before_completion() {
        let (env, client, _admin, user, sac_address) = setup();
        let token_client = token::Client::new(&env, &sac_address);
        let executor = Address::generate(&env);
        let approver_one = Address::generate(&env);
        let approver_two = Address::generate(&env);
        let approvers = vec![&env, approver_one.clone(), approver_two.clone()];
        client.set_executor(&executor, &true);

        client.create_task(
            &3u64,
            &user,
            &Symbol::new(&env, "coding"),
            &2_500_000i128,
            &Symbol::new(&env, "wallet"),
            &Symbol::new(&env, "multisig"),
            &2u32,
            &Symbol::new(&env, "wallet"),
            &user,
            &approvers,
        );

        client.approve_task(&3u64, &approver_one);
        client.approve_task(&3u64, &approver_two);
        client.complete_task(&3u64, &user, &false);

        let task = client.get_task(&3u64);
        assert!(task.status == TaskStatus::Completed);
        assert!(task.approval_count == 2u32);
        assert!(token_client.balance(&user) == 10_000_000i128);
    }

    #[test]
    fn smart_wallet_delegate_can_cancel_task() {
        let (env, client, _admin, user, _sac_address) = setup();
        let delegate = Address::generate(&env);

        client.set_smart_wallet(&user, &delegate, &Symbol::new(&env, "delegate"));
        client.create_task(
            &4u64,
            &user,
            &Symbol::new(&env, "browser"),
            &1_000_000i128,
            &Symbol::new(&env, "wallet"),
            &Symbol::new(&env, "single"),
            &1u32,
            &Symbol::new(&env, "smart"),
            &delegate,
            &vec![&env],
        );

        client.cancel_task(&4u64, &delegate);

        let task = client.get_task(&4u64);
        assert!(task.status == TaskStatus::Cancelled);
    }
}

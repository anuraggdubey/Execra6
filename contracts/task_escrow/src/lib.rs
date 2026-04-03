#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol};

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
}

#[contracttype]
enum DataKey {
    Admin,
    Token,
    Executors(Address),
    Task(u64),
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

    pub fn create_task(env: Env, task_id: u64, user: Address, agent_type: Symbol, reward: i128) {
        user.require_auth();
        ensure_positive_reward(&env, reward);

        let key = DataKey::Task(task_id);
        if env.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(&env, TaskEscrowError::TaskAlreadyExists);
        }

        let task = Task {
            task_id,
            user: user.clone(),
            agent_type,
            reward,
            status: TaskStatus::Pending,
        };

        token_client(&env).transfer(&user, &env.current_contract_address(), &reward);
        env.storage().persistent().set(&key, &task);
        extend_persistent(&env, &key);
        extend_instance(&env);
    }

    pub fn complete_task(env: Env, task_id: u64, caller: Address, pay_executor: bool) {
        let key = DataKey::Task(task_id);
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
        if caller != task.user {
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
    use soroban_sdk::{testutils::Address as _, token};

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

        client.create_task(&1u64, &user, &Symbol::new(&env, "email"), &reward);

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

        client.create_task(&2u64, &user, &Symbol::new(&env, "search"), &reward);

        let task = client.get_task(&2u64);
        assert!(task.task_id == 2u64);
        assert!(task.user == user);
        assert!(task.agent_type == Symbol::new(&env, "search"));
        assert!(task.reward == reward);
        assert!(task.status == TaskStatus::Pending);
        assert!(token_client.balance(&user) == 8_000_000i128);
    }
}

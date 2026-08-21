// Execra Soroban Contract
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    Symbol, Vec,
};

const INSTANCE_BUMP_THRESHOLD: u32 = 518_400;
const INSTANCE_BUMP_AMOUNT: u32 = 535_680;
const PERSISTENT_BUMP_THRESHOLD: u32 = 518_400;
const PERSISTENT_BUMP_AMOUNT: u32 = 535_680;

#[contracttype]
#[derive(Clone, Eq, PartialEq, Debug)]
pub struct TaskProof {
    pub task_id: Symbol,
    pub output_hash: BytesN<32>,
    pub agent_id: Symbol,
    pub submitted_by: Address,
    pub verified: bool,
    pub submitted_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Proof(Symbol),
    Executors,
    AgentProofs(Symbol),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TaskProofError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    ProofAlreadyExists = 3,
    ProofNotFound = 4,
}

#[contract]
pub struct TaskProofContract;

#[contractimpl]
impl TaskProofContract {
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

        let agent_key = DataKey::AgentProofs(agent_id);
        let mut proofs = read_agent_proofs(&env, &agent_key);
        proofs.push_back(task_id);
        env.storage().persistent().set(&agent_key, &proofs);
        extend_persistent(&env, &agent_key);
        extend_instance(&env);
    }

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

    pub fn get_proof(env: Env, task_id: Symbol) -> TaskProof {
        read_proof(&env, &DataKey::Proof(task_id))
    }

    pub fn is_verified(env: Env, task_id: Symbol) -> bool {
        match env.storage().persistent().get::<_, TaskProof>(&DataKey::Proof(task_id)) {
            Some(proof) => proof.verified,
            None => false,
        }
    }

    pub fn proof_exists(env: Env, task_id: Symbol) -> bool {
        env.storage().persistent().has(&DataKey::Proof(task_id))
    }

    pub fn authorize_executor(env: Env, admin: Address, executor: Address) {
        require_admin(&env, &admin);
        let mut executors = read_executors(&env);
        if !executors.contains(&executor) {
            executors.push_back(executor);
            env.storage().instance().set(&DataKey::Executors, &executors);
            extend_instance(&env);
        }
    }

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

    pub fn is_authorized_executor(env: Env, executor: Address) -> bool {
        read_executors(&env).contains(&executor)
    }

    pub fn get_all_proofs_by_agent(env: Env, agent_id: Symbol) -> Vec<Symbol> {
        read_agent_proofs(&env, &DataKey::AgentProofs(agent_id))
    }

    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        require_admin(&env, &admin);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

fn require_admin(env: &Env, admin: &Address) {
    let stored_admin = read_admin(env);
    if stored_admin != *admin {
        soroban_sdk::panic_with_error!(env, TaskProofError::Unauthorized);
    }
    admin.require_auth();
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&symbol_short!("ADMIN"))
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskProofError::Unauthorized))
}

fn read_executors(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::Executors)
        .unwrap_or_else(|| Vec::<Address>::new(env))
}

fn read_agent_proofs(env: &Env, key: &DataKey) -> Vec<Symbol> {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| Vec::<Symbol>::new(env))
}

fn read_proof(env: &Env, key: &DataKey) -> TaskProof {
    env.storage()
        .persistent()
        .get(key)
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, TaskProofError::ProofNotFound))
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

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

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

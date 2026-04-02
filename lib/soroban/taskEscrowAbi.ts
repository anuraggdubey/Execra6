export const TASK_ESCROW_ABI = [
    {
        name: "init",
        inputs: ["admin: Address", "token_contract: Address"],
    },
    {
        name: "set_executor",
        inputs: ["executor: Address", "allowed: bool"],
    },
    {
        name: "create_task",
        inputs: ["task_id: u64", "user: Address", "agent_type: Symbol", "reward: i128"],
    },
    {
        name: "complete_task",
        inputs: ["task_id: u64", "caller: Address", "pay_executor: bool"],
    },
    {
        name: "cancel_task",
        inputs: ["task_id: u64", "caller: Address"],
    },
    {
        name: "get_task",
        inputs: ["task_id: u64"],
    },
] as const

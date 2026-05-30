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
        name: "deposit",
        inputs: ["user: Address", "amount: i128"],
    },
    {
        name: "withdraw",
        inputs: ["user: Address", "amount: i128"],
    },
    {
        name: "get_balance",
        inputs: ["user: Address"],
    },
    {
        name: "create_task",
        inputs: ["task_id: Symbol", "user: Address", "agent_type: Symbol", "reward: i128"],
    },
    {
        name: "complete_task",
        inputs: ["task_id: Symbol", "caller: Address", "pay_executor: bool", "output_hash: BytesN<32>"],
    },
    {
        name: "cancel_task",
        inputs: ["task_id: Symbol", "caller: Address"],
    },
    {
        name: "get_task",
        inputs: ["task_id: Symbol"],
    },
] as const

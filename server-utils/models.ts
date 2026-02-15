export type ModelTier = "production" | "system" | "preview" | "custom";

export type ModelItem = {
    id: string;
    label: string;
    tier: ModelTier;
};

export const MODEL_PRESETS: ModelItem[] = [
    // Production (chat)
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (instant)", tier: "production" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (versatile)", tier: "production" },
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B", tier: "production" },
    { id: "openai/gpt-oss-120b", label: "GPT OSS 120B", tier: "production" },

    // Systems
    { id: "groq/compound", label: "Groq Compound (system)", tier: "system" },
    { id: "groq/compound-mini", label: "Groq Compound Mini (system)", tier: "system" },

    // Preview (metti solo se ti serve davvero)
    { id: "qwen/qwen3-32b", label: "Qwen3 32B (preview)", tier: "preview" }
];

export const DEFAULT_ENABLED_MODEL_IDS = new Set<string>([
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b"
]);
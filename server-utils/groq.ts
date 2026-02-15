import "server-only";
import Groq from "groq-sdk";

export type GroqChatParams = {
    text: string;
    superPrompt: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
};

export type GroqChatResult = {
    content: string;
    model: string;
    usage?: unknown;
};

function getGroqClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GROQ_API_KEY. Put it in .env.local");
    }
    return new Groq({ apiKey });
}

export async function callGroqChatCompletion(params: GroqChatParams): Promise<GroqChatResult> {
    const groq = getGroqClient();

    const {
        text,
        superPrompt,
        model,
        temperature = 0.7,
        maxTokens = 700
    } = params;

    const completion = await groq.chat.completions.create({
        model,
        messages: [
            { role: "system", content: superPrompt },
            { role: "user", content: text }
        ],
        temperature,
        max_tokens: maxTokens
    });

    const content = completion.choices?.[0]?.message?.content ?? "";

    return {
        content,
        model: completion.model ?? model,
        usage: (completion as any).usage
    };
}

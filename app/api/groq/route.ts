import { NextRequest, NextResponse } from "next/server";
import { callGroqChatCompletion } from "@/server-utils/groq";

export const runtime = "nodejs";

type Body = {
    text: unknown;
    superPrompt: unknown;
    model: unknown;
    temperature?: unknown;
    maxTokens?: unknown;
};

function clampNumber(v: number, min: number, max: number) {
    return Math.min(max, Math.max(min, v));
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Body;

        if (typeof body.text !== "string") {
            return NextResponse.json({ error: "Invalid 'text' (must be string)" }, { status: 400 });
        }
        if (typeof body.superPrompt !== "string") {
            return NextResponse.json({ error: "Invalid 'superPrompt' (must be string)" }, { status: 400 });
        }
        if (typeof body.model !== "string") {
            return NextResponse.json({ error: "Invalid 'model' (must be string)" }, { status: 400 });
        }

        const temperature =
            typeof body.temperature === "number" ? clampNumber(body.temperature, 0, 2) : 0.7;

        const maxTokens =
            typeof body.maxTokens === "number" ? clampNumber(body.maxTokens, 16, 32768) : 700;

        const result = await callGroqChatCompletion({
            text: body.text,
            superPrompt: body.superPrompt,
            model: body.model,
            temperature,
            maxTokens
        });

        return NextResponse.json(result, { status: 200 });
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message ?? "Unknown server error" },
            { status: 500 }
        );
    }
}

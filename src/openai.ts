/**
 * OpenAI client used by the analyse, translate, and doctor agents.
 * Returns parsed JSON only; zod checks and identity gates live in the pipeline.
 */

import type { LlmClient } from "./types.ts";

const DEFAULT_MODEL = "gpt-4o-mini";

export const openaiJson: LlmClient = async ({ step, system, user }) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is empty. Add it to .env before running the pipeline.");
  }
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ${step} failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = JSON.parse(body) as { choices?: { message?: { content?: string | null } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI ${step} returned an empty message`);

  return { step, model, json: JSON.parse(content) as unknown };
};

/**
 * OpenAI tool used by the analyse, translate, and doctor agents.
 * The caller passes the step name for traces. Identity checks stay outside this file.
 */

const DEFAULT_MODEL = "gpt-4o-mini";

export async function openaiJson({ step, system, user, model = process.env.OPENAI_MODEL || DEFAULT_MODEL }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. The analyse, translate, and doctor agents call OpenAI.");
  }

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

  const payload = JSON.parse(body);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI ${step} returned an empty message`);

  return {
    step,
    model,
    json: JSON.parse(content),
  };
}

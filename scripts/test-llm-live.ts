// One-off connectivity smoke test for the Anthropic-backed invokeLLM adapter.
// Run via `railway run` so it has real env vars, without ever printing the key.
import { invokeLLM } from "../server/_core/llm";

async function main() {
  const res = await invokeLLM({
    messages: [
      { role: "system", content: "You are a home decor e-commerce SEO expert. Return JSON only." },
      { role: "user", content: "Return JSON: { \"ok\": true, \"note\": a 5-word confirmation string }" },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "smoke_test",
        strict: true,
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, note: { type: "string" } },
          required: ["ok", "note"],
          additionalProperties: false,
        },
      },
    },
  });

  console.log("RESULT_STATUS: SUCCESS");
  console.log("RESULT_MODEL:", res.model);
  console.log("RESULT_CONTENT:", res.choices[0]?.message?.content);
  console.log("RESULT_USAGE:", JSON.stringify(res.usage));

  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  if (parsed.ok !== true) {
    throw new Error("Response did not parse to the expected schema");
  }
  console.log("RESULT_SCHEMA_VALID: true");
}

main().catch(err => {
  console.error("RESULT_STATUS: FAILURE");
  console.error(String(err));
  process.exit(1);
});

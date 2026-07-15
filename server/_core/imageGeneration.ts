/**
 * AI image generation via OpenAI's Images API (gpt-image-1). Requires
 * OPENAI_API_KEY — Anthropic does not offer image generation, so unlike
 * invokeLLM() there is no same-vendor fallback here.
 */
import { storagePut } from "server/storage";
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-1";

function assertConfigured() {
  if (!ENV.openaiApiKey) {
    throw new Error(
      "No image generation provider is configured. Set OPENAI_API_KEY to enable AI image generation (Anthropic does not offer one)."
    );
  }
  // Header values must be Latin-1; a key pasted from a masked field can carry
  // a bullet (•, 8226) that makes fetch() throw a cryptic ByteString error.
  for (let i = 0; i < ENV.openaiApiKey.length; i++) {
    const code = ENV.openaiApiKey.charCodeAt(i);
    if (code > 255) {
      throw new Error(
        `OPENAI_API_KEY contains an invalid character (code ${code} at position ${i}) — corrupted copy-paste. Reveal and re-copy the real key from the provider dashboard, re-paste into Railway → Variables → OPENAI_API_KEY, and redeploy.`
      );
    }
  }
}

async function extractImageBuffer(response: Response): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    data: Array<{ b64_json?: string; url?: string }>;
  };
  const item = result.data?.[0];
  if (!item) throw new Error("Image generation returned no results");

  if (item.b64_json) {
    return { buffer: Buffer.from(item.b64_json, "base64"), mimeType: "image/png" };
  }
  if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`Failed to fetch generated image (${imgRes.status})`);
    return { buffer: Buffer.from(await imgRes.arrayBuffer()), mimeType: "image/png" };
  }
  throw new Error("Image generation response had neither b64_json nor url");
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  assertConfigured();

  const sourceImage = options.originalImages?.find(img => img.url || img.b64Json);
  let buffer: Buffer;
  let mimeType: string;

  if (sourceImage) {
    const sourceBuffer = sourceImage.b64Json
      ? Buffer.from(sourceImage.b64Json, "base64")
      : Buffer.from(await (await fetch(sourceImage.url!)).arrayBuffer());

    const form = new FormData();
    form.set("model", MODEL);
    form.set("prompt", options.prompt);
    form.set(
      "image",
      new Blob([sourceBuffer], { type: sourceImage.mimeType || "image/png" }),
      "source.png"
    );

    const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${ENV.openaiApiKey}` },
      body: form,
    });
    ({ buffer, mimeType } = await extractImageBuffer(response));
  } else {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: options.prompt,
        size: "1024x1024",
      }),
    });
    ({ buffer, mimeType } = await extractImageBuffer(response));
  }

  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, mimeType);
  return { url };
}

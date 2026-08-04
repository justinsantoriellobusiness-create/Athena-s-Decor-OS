/**
 * Social publishing via Buffer's GraphQL API (https://api.buffer.com).
 *
 * Why Buffer rather than per-network APIs: publishing to Instagram, TikTok,
 * X, LinkedIn, Pinterest and the rest means a separate OAuth app, review
 * process and token lifecycle for each. Buffer fronts all of them behind one
 * key, so connecting once covers eleven networks.
 *
 * Auth is a personal API key (Buffer account → Settings → API), sent as a
 * bearer token. Buffer's third-party OAuth is not open yet, but a personal
 * key is the right fit here anyway — this is a single-operator app connecting
 * its owner's own account, not a SaaS onboarding end users.
 *
 * NOTE ON SCHEMA ACCURACY: Buffer's developer docs (developers.buffer.com)
 * return 403 to non-browser clients, so the mutation/query shapes below come
 * from their published guides rather than a fetched schema. testBufferConnection()
 * exists to surface a mismatch loudly on first use instead of failing silently
 * mid-campaign — if Buffer's schema differs, the GraphQL error text is
 * returned verbatim so it can be corrected in one place.
 */
const BUFFER_API_URL = "https://api.buffer.com";

export type BufferChannel = {
  id: string;
  name: string;
  service: string;
};

export type BufferPostResult = {
  id: string;
  status?: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

/**
 * Single place every Buffer call goes through, so auth, error shape and the
 * "GraphQL 200-with-errors" case are handled identically everywhere.
 * GraphQL returns HTTP 200 even for query errors, so the errors array must be
 * checked explicitly — treating a 200 as success would swallow every failure.
 */
async function bufferGraphQL<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Buffer rejected the API key. Regenerate it in Buffer → Settings → API and reconnect."
      );
    }
    throw new Error(`Buffer API returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Buffer API error: ${json.errors.map(e => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Buffer API returned no data");
  return json.data;
}

const CHANNELS_QUERY = `
  query Channels {
    channels {
      id
      name
      service
    }
  }
`;

/** Connected social accounts. Each has an id used as createPost's channelId. */
export async function listBufferChannels(apiKey: string): Promise<BufferChannel[]> {
  const data = await bufferGraphQL<{ channels?: BufferChannel[] }>(apiKey, CHANNELS_QUERY);
  return data.channels ?? [];
}

/**
 * Verifies the key by listing channels — the cheapest call that proves both
 * that the key authenticates and that the schema matches what this client
 * expects. Returns a structured result rather than throwing so the UI can
 * show the real reason.
 */
export async function testBufferConnection(
  apiKey: string
): Promise<{ ok: true; channelCount: number } | { ok: false; error: string }> {
  try {
    const channels = await listBufferChannels(apiKey);
    return { ok: true, channelCount: channels.length };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      status
    }
  }
`;

export type CreateBufferPostInput = {
  channelId: string;
  text: string;
  /** ISO timestamp. Omit to let Buffer use the channel's next queue slot. */
  scheduledAt?: string;
  /** Public image URL to attach. */
  imageUrl?: string;
};

/**
 * Queues or schedules one post on one channel.
 *
 * Buffer applies each channel's own approval setting: if the channel is set to
 * "Requires Approval", the post lands as a draft awaiting review rather than
 * going out immediately. That's Buffer's behaviour, not something this client
 * can override — worth knowing when a post doesn't appear as published.
 */
export async function createBufferPost(
  apiKey: string,
  input: CreateBufferPostInput
): Promise<BufferPostResult> {
  const data = await bufferGraphQL<{ createPost?: BufferPostResult }>(
    apiKey,
    CREATE_POST_MUTATION,
    {
      input: {
        channelId: input.channelId,
        text: input.text,
        // schedulingType tells Buffer whether to honour scheduledAt or drop
        // the post into the channel's existing queue.
        schedulingType: input.scheduledAt ? "custom" : "queue",
        ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
        ...(input.imageUrl ? { media: [{ url: input.imageUrl }] } : {}),
      },
    }
  );
  if (!data.createPost) throw new Error("Buffer accepted the request but returned no post");
  return data.createPost;
}

/**
 * Publishes the same text to several channels, reporting per-channel outcomes
 * instead of failing the whole batch on the first error — one disconnected
 * channel shouldn't stop the other ten from going out.
 */
export async function createBufferPostMulti(
  apiKey: string,
  channelIds: string[],
  post: Omit<CreateBufferPostInput, "channelId">
): Promise<Array<{ channelId: string; ok: boolean; postId?: string; error?: string }>> {
  const results: Array<{ channelId: string; ok: boolean; postId?: string; error?: string }> = [];
  for (const channelId of channelIds) {
    try {
      const created = await createBufferPost(apiKey, { ...post, channelId });
      results.push({ channelId, ok: true, postId: created.id });
    } catch (err: any) {
      results.push({ channelId, ok: false, error: err?.message ?? String(err) });
    }
  }
  return results;
}

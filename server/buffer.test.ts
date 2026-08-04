import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listBufferChannels,
  createBufferPost,
  createBufferPostMulti,
  testBufferConnection,
} from "./_core/buffer";

const KEY = "test-buffer-key";
// A fresh Response per call: a Response body can only be read once, so
// reusing one instance across calls fails on the second read.
const gql = (body: unknown, status = 200) =>
  () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const always = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => gql(body, status)());

afterEach(() => vi.restoreAllMocks());

describe("buffer client", () => {
  it("sends the API key as a bearer token to the GraphQL endpoint", async () => {
    const spy = always({ data: { channels: [] } });
    await listBufferChannels(KEY);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://api.buffer.com");
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it("returns channels", async () => {
    always({ data: { channels: [{ id: "c1", name: "Athena IG", service: "instagram" }] } });
    const channels = await listBufferChannels(KEY);
    expect(channels).toHaveLength(1);
    expect(channels[0].service).toBe("instagram");
  });

  it("treats a GraphQL error array as a failure even though HTTP is 200", async () => {
    // The trap this client exists to avoid: GraphQL returns 200 for query
    // errors, so res.ok alone would report success on a hard failure.
    always({ errors: [{ message: "Unknown field" }] });
    await expect(listBufferChannels(KEY)).rejects.toThrow(/Unknown field/);
  });

  it("gives an actionable message on a rejected key", async () => {
    always({}, 401);
    await expect(listBufferChannels(KEY)).rejects.toThrow(/Regenerate it in Buffer/);
  });

  it("reports connection failures as a result instead of throwing", async () => {
    always({ errors: [{ message: "nope" }] });
    const r = await testBufferConnection(KEY);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("nope") });
  });

  it("confirms a good connection with a channel count", async () => {
    always({ data: { channels: [{ id: "a", name: "A", service: "x" }, { id: "b", name: "B", service: "y" }] } });
    expect(await testBufferConnection(KEY)).toEqual({ ok: true, channelCount: 2 });
  });

  it("queues a post with no scheduledAt and schedules one with it", async () => {
    const spy = always({ data: { createPost: { id: "p1" } } });

    await createBufferPost(KEY, { channelId: "c1", text: "hello" });
    let sent = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(sent.variables.input.schedulingType).toBe("queue");
    expect(sent.variables.input).not.toHaveProperty("scheduledAt");

    await createBufferPost(KEY, { channelId: "c1", text: "hi", scheduledAt: "2026-09-01T10:00:00.000Z" });
    sent = JSON.parse(String(spy.mock.calls[1][1]?.body));
    expect(sent.variables.input.schedulingType).toBe("custom");
    expect(sent.variables.input.scheduledAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("attaches media only when an image URL is given", async () => {
    const spy = always({ data: { createPost: { id: "p1" } } });
    await createBufferPost(KEY, { channelId: "c1", text: "x", imageUrl: "https://img.example/a.png" });
    const sent = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(sent.variables.input.media).toEqual([{ url: "https://img.example/a.png" }]);
  });

  it("keeps posting to the remaining channels when one fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gql({ data: { createPost: { id: "p1" } } })())
      .mockResolvedValueOnce(gql({ errors: [{ message: "channel disconnected" }] })())
      .mockResolvedValueOnce(gql({ data: { createPost: { id: "p3" } } })());

    const results = await createBufferPostMulti(KEY, ["c1", "c2", "c3"], { text: "hello" });
    expect(results.map(r => r.ok)).toEqual([true, false, true]);
    expect(results[1].error).toMatch(/channel disconnected/);
    expect(results[2].postId).toBe("p3");
  });

  it("errors when Buffer accepts the request but returns no post", async () => {
    always({ data: {} });
    await expect(createBufferPost(KEY, { channelId: "c1", text: "x" })).rejects.toThrow(/no post/);
  });
});

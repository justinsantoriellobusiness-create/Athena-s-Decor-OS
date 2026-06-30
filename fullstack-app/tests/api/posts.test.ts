import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../../src/api/app.js";

describe("Posts API", () => {
  let userId: string;

  beforeAll(async () => {
    const userRes = await request(app)
      .post("/api/users")
      .send({ name: "Post Author", email: "author@example.com" });
    userId = userRes.body.id;
  });

  it("GET /api/posts returns an array of seeded posts", async () => {
    const res = await request(app).get("/api/posts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("POST /api/posts creates a post on success", async () => {
    const res = await request(app)
      .post("/api/posts")
      .send({ userId, title: "My Title", body: "My Body" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId, title: "My Title", body: "My Body" });
    expect(res.body.id).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
  });

  it("POST /api/posts returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/posts").send({ userId, title: "No body" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /api/posts returns 400 when userId does not reference an existing user", async () => {
    const res = await request(app)
      .post("/api/posts")
      .send({ userId: "no-such-user", title: "T", body: "B" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/posts/:id returns the post when found", async () => {
    const created = await request(app)
      .post("/api/posts")
      .send({ userId, title: "Find Post", body: "Body" });
    const res = await request(app).get(`/api/posts/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("GET /api/posts/:id returns 404 when not found", async () => {
    const res = await request(app).get("/api/posts/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("GET /api/posts?userId= filters posts by user", async () => {
    const res = await request(app).get(`/api/posts?userId=${userId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const post of res.body) {
      expect(post.userId).toBe(userId);
    }
  });

  it("DELETE /api/posts/:id removes the post and returns 204", async () => {
    const created = await request(app)
      .post("/api/posts")
      .send({ userId, title: "Delete Post", body: "Body" });
    const del = await request(app).delete(`/api/posts/${created.body.id}`);
    expect(del.status).toBe(204);

    const getAfter = await request(app).get(`/api/posts/${created.body.id}`);
    expect(getAfter.status).toBe(404);
  });

  it("DELETE /api/posts/:id returns 404 for unknown id", async () => {
    const res = await request(app).delete("/api/posts/does-not-exist");
    expect(res.status).toBe(404);
  });
});

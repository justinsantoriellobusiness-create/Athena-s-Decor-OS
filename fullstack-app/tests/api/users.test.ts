import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/api/server.js";

describe("Users API", () => {
  it("GET /api/users returns an array of seeded users", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("id");
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("email");
  });

  it("POST /api/users creates a user on success", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "Test User", email: "test@example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Test User", email: "test@example.com" });
    expect(res.body.id).toBeTruthy();
  });

  it("POST /api/users returns 400 when name or email is missing", async () => {
    const res = await request(app).post("/api/users").send({ name: "Only Name" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/users/:id returns the user when found", async () => {
    const created = await request(app)
      .post("/api/users")
      .send({ name: "Find Me", email: "findme@example.com" });
    const res = await request(app).get(`/api/users/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("GET /api/users/:id returns 404 when not found", async () => {
    const res = await request(app).get("/api/users/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/users/:id removes the user and returns 204", async () => {
    const created = await request(app)
      .post("/api/users")
      .send({ name: "Delete Me", email: "deleteme@example.com" });
    const del = await request(app).delete(`/api/users/${created.body.id}`);
    expect(del.status).toBe(204);

    const getAfter = await request(app).get(`/api/users/${created.body.id}`);
    expect(getAfter.status).toBe(404);
  });

  it("DELETE /api/users/:id returns 404 for unknown id", async () => {
    const res = await request(app).delete("/api/users/does-not-exist");
    expect(res.status).toBe(404);
  });
});

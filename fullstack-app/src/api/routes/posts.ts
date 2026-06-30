import { Router, Request, Response } from "express";
import { posts, users, nextPostId, Post } from "../store.js";

const router = Router();

// GET /api/posts?userId=
router.get("/", (req: Request, res: Response) => {
  const { userId } = req.query;
  if (userId && typeof userId === "string") {
    return res.json(posts.filter((p) => p.userId === userId));
  }
  res.json(posts);
});

// POST /api/posts
router.post("/", (req: Request, res: Response) => {
  const { userId, title, body } = req.body ?? {};

  if (
    !userId ||
    typeof userId !== "string" ||
    !title ||
    typeof title !== "string" ||
    !body ||
    typeof body !== "string"
  ) {
    return res.status(400).json({ error: "userId, title, and body are required strings" });
  }

  const author = users.find((u) => u.id === userId);
  if (!author) {
    return res.status(400).json({ error: "userId does not reference an existing user" });
  }

  const post: Post = {
    id: nextPostId(),
    userId,
    title,
    body,
    createdAt: new Date().toISOString(),
  };
  posts.push(post);
  res.status(201).json(post);
});

// GET /api/posts/:id
router.get("/:id", (req: Request, res: Response) => {
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }
  res.json(post);
});

// DELETE /api/posts/:id
router.delete("/:id", (req: Request, res: Response) => {
  const index = posts.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Post not found" });
  }
  posts.splice(index, 1);
  res.status(204).send();
});

export default router;

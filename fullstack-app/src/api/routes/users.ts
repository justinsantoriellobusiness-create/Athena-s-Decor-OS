import { Router, Request, Response } from "express";
import { users, posts, nextUserId, User } from "../store.js";

const router = Router();

// GET /api/users
router.get("/", (_req: Request, res: Response) => {
  res.json(users);
});

// POST /api/users
router.post("/", (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};

  if (!name || typeof name !== "string" || !email || typeof email !== "string") {
    return res.status(400).json({ error: "name and email are required strings" });
  }

  const user: User = { id: nextUserId(), name, email };
  users.push(user);
  res.status(201).json(user);
});

// GET /api/users/:id
router.get("/:id", (req: Request, res: Response) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

// DELETE /api/users/:id
router.delete("/:id", (req: Request, res: Response) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  const [removed] = users.splice(index, 1);

  // cascade-remove posts belonging to this user
  for (let i = posts.length - 1; i >= 0; i -= 1) {
    if (posts[i].userId === removed.id) {
      posts.splice(i, 1);
    }
  }

  res.status(204).send();
});

export default router;

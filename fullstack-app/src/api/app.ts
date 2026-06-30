import express from "express";
import cors from "cors";
import usersRouter from "./routes/users.js";
import postsRouter from "./routes/posts.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/users", usersRouter);
app.use("/api/posts", postsRouter);

export default app;

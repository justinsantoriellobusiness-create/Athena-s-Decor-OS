import { useEffect, useState } from "react";
import { Post, User } from "../api/types";
import Card from "./Card";
import Loading from "./Loading";
import ErrorMessage from "./ErrorMessage";

export default function PostList({ users }: { users: User[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadPosts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      setError("Failed to load posts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    if (!userId && users.length > 0) {
      setUserId(users[0].id);
    }
  }, [users, userId]);

  function authorName(uid: string): string {
    return users.find((u) => u.id === uid)?.name ?? "Unknown";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim() || !body.trim() || !userId) {
      setFormError("Title, body, and author are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Status ${res.status}`);
      }
      setTitle("");
      setBody("");
      await loadPosts();
    } catch (err: any) {
      setFormError(err.message || "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>Posts</h2>
      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && (
        <div>
          {posts.length === 0 && <p>No posts yet.</p>}
          {posts.map((p) => (
            <Card key={p.id}>
              <strong>{p.title}</strong>
              <div style={{ fontSize: 14, color: "#666" }}>by {authorName(p.userId)}</div>
              <p>{p.body}</p>
            </Card>
          ))}
        </div>
      )}

      <h3>Add Post</h3>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
          {users.length === 0 && <option value="">No users available</option>}
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding..." : "Add Post"}
        </button>
      </form>
      {formError && <ErrorMessage message={formError} />}
    </section>
  );
}

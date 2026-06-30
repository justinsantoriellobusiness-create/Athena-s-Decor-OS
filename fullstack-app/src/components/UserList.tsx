import { useEffect, useState } from "react";
import { User } from "../api/types";
import Card from "./Card";
import Loading from "./Loading";
import ErrorMessage from "./ErrorMessage";

export default function UserList({ onUsersChange }: { onUsersChange?: (users: User[]) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setUsers(data);
      onUsersChange?.(data);
    } catch (err) {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !email.trim()) {
      setFormError("Name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Status ${res.status}`);
      }
      setName("");
      setEmail("");
      await loadUsers();
    } catch (err: any) {
      setFormError(err.message || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>Users</h2>
      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && (
        <div>
          {users.length === 0 && <p>No users yet.</p>}
          {users.map((u) => (
            <Card key={u.id}>
              <strong>{u.name}</strong>
              <div style={{ color: "#666", fontSize: 14 }}>{u.email}</div>
            </Card>
          ))}
        </div>
      )}

      <h3>Add User</h3>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding..." : "Add User"}
        </button>
      </form>
      {formError && <ErrorMessage message={formError} />}
    </section>
  );
}

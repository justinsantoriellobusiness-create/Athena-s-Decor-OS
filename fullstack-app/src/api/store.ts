export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Post {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
}

let userSeq = 0;
let postSeq = 0;

export function nextUserId(): string {
  userSeq += 1;
  return `u${userSeq}`;
}

export function nextPostId(): string {
  postSeq += 1;
  return `p${postSeq}`;
}

export const users: User[] = [];
export const posts: Post[] = [];

function seed() {
  const u1: User = { id: nextUserId(), name: "Ada Lovelace", email: "ada@example.com" };
  const u2: User = { id: nextUserId(), name: "Grace Hopper", email: "grace@example.com" };
  const u3: User = { id: nextUserId(), name: "Alan Turing", email: "alan@example.com" };
  users.push(u1, u2, u3);

  posts.push(
    {
      id: nextPostId(),
      userId: u1.id,
      title: "Hello World",
      body: "My first post on the platform.",
      createdAt: new Date().toISOString(),
    },
    {
      id: nextPostId(),
      userId: u2.id,
      title: "Compilers are fun",
      body: "Thoughts on building the first compiler.",
      createdAt: new Date().toISOString(),
    },
    {
      id: nextPostId(),
      userId: u1.id,
      title: "Second post",
      body: "Another update from Ada.",
      createdAt: new Date().toISOString(),
    }
  );
}

seed();

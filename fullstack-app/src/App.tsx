import { useState } from "react";
import { User } from "./api/types";
import UserList from "./components/UserList";
import PostList from "./components/PostList";
import "./App.css";

export default function App() {
  const [users, setUsers] = useState<User[]>([]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Users & Posts App</h1>
      </header>
      <main className="app-main">
        <UserList onUsersChange={setUsers} />
        <PostList users={users} />
      </main>
    </div>
  );
}

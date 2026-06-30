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

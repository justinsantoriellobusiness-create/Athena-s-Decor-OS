import { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        background: "#fff",
      }}
    >
      {children}
    </div>
  );
}

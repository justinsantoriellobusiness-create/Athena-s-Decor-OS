export default function ErrorMessage({ message }: { message: string }) {
  return <p style={{ color: "red" }}>{message}</p>;
}

import { jsx } from "react/jsx-runtime";

export default function Header({ children }: { children: React.ReactNode }) {
  return jsx("header", { className: "beautiful-header", children });
}

import { jsx } from "react/jsx-runtime";

export default function Header({
  accessory,
  children,
}: {
  accessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return jsx("header", {
    className: "beautiful-header",
    children: [
      children,
      accessory
        ? jsx("span", { className: "header-accessory", children: accessory })
        : null,
    ],
  });
}

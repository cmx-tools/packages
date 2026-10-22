import { jsx } from "react/jsx-runtime";

export function AssetImage(props: {
  src: string;
  width: number;
  height: number;
  alt: string;
}) {
  return jsx("img", props);
}

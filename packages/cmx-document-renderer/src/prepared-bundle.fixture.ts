import { jsx } from "cmx-runtime/jsx-runtime";

export const meta = {
  title: "Hello",
};

export const teaser = () => ({
  heading: "Hello",
});

export default jsx("main", { children: "Hello" });

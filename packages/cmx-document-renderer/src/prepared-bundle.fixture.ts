import { jsx } from "cmx-runtime/jsx-runtime";

export const meta = {
  title: "Hello",
  accessory: jsx("strong", {
    children: "Meta slot",
  }),
};

export const teaser = () => ({
  heading: "Hello",
});

export default jsx("main", { children: "Hello" });

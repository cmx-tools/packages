import { jsx } from "@cmx-tools/runtime/jsx-runtime";

export const meta = {
  title: "Hello",
  accessory: jsx("strong", {
    children: "Meta slot",
  }),
};

export const teaser = () => ({
  heading: "Hello",
});

export const plainString = "hello";
export const plainNumber = 42;
export const plainBoolean = true;
export const plainNull = null;
export const plainArray = ["hello", 42, true, null];

export default jsx("main", { children: "Hello" });

import { __registerExternal, jsx } from "@cmx-tools/runtime/jsx-runtime";

const Panel = __registerExternal({ from: "@site/ui", import: "Panel" });

export const slot = jsx(Panel, {
  heading: Promise.resolve(jsx("h1", { innerHTML: "<em>Heading</em>" })),
});

export const componentProps = jsx(Panel, {
  innerHTML: "application data",
  template: {
    type: "element",
    tag: "div",
    props: { innerHTML: "application template" },
  },
});

export const metadata = {
  innerHTML: "metadata",
  template: {
    type: "element",
    tag: "div",
    props: { innerHTML: "metadata template" },
  },
};

export const frameworkHtml = jsx("div", {
  dangerouslySetInnerHTML: { __html: "<b>Framework</b>" },
});

export const omittedHtml = jsx("div", {
  innerHTML: Promise.resolve(undefined),
});

export default jsx("div", {
  ...{ innerHTML: Promise.resolve("<strong>Editorial</strong>") },
});

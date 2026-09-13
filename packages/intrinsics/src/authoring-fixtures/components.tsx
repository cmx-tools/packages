import type { CmxChildren } from "@cmx-tools/intrinsics";

function Card({
  title,
  children = null,
}: {
  title: string;
  children?: CmxChildren;
}) {
  return (
    <article>
      <h1>{title}</h1>
      {children}
    </article>
  );
}

function Computed({ text }: { text: () => string }) {
  return text();
}

async function AsyncHeading() {
  return <h2>Fresh each day</h2>;
}

function List() {
  return [<li>Light roast</li>, <li>Dark roast</li>];
}

export const page = (
  <>
    <Card title="Coffee">
      <AsyncHeading />
      <Computed text={() => "Roasted locally"} />
      <ul>
        <List />
      </ul>
      {false}
      {null}
      {3}
    </Card>
  </>
);

// @ts-expect-error Local function props retain their declared required fields.
export const missingTitle = <Card />;
const interactive = { onClick: () => undefined };
const capture = { onPointerDownCapture: () => undefined };
// @ts-expect-error Document-facing intrinsic callbacks are rejected in spreads.
export const spreadCallback = <button {...interactive}>Order</button>;
// @ts-expect-error Capture callbacks are rejected too.
export const captureCallback = <div {...capture} />;
// @ts-expect-error The standard lowercase event spelling is also forbidden.
export const standardCallback = <button {...{ onclick: () => undefined }} />;
// @ts-expect-error Ref objects cannot belong to static intrinsic authoring.
export const objectRef = <div ref={{ current: null }} />;
// @ts-expect-error Ref callbacks in spreads cannot belong to static intrinsic authoring.
export const callbackRef = <div {...{ ref: () => undefined }} />;
// @ts-expect-error Functions cannot be rendered as intrinsic children.
export const callbackChild = <div>{() => "Hello"}</div>;
// @ts-expect-error Arbitrary objects cannot be rendered as intrinsic children.
export const objectChild = <div>{{ coffee: "dark" }}</div>;

function Empty() {}
// @ts-expect-error Undefined is not renderable Document Content.
export const emptyComponent = <Empty />;

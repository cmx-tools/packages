export const article = (
  <article class="story">
    <h1>CMX without React</h1>
    <p lang="en">A bare CMX Content Project.</p>
  </article>
);

// @ts-expect-error Misspelled tags must not silently become custom elements.
export const typo = <artcle />;
// @ts-expect-error Intrinsic callbacks cannot survive Document Rendering.
export const callback = <button onClick={() => undefined}>Read</button>;

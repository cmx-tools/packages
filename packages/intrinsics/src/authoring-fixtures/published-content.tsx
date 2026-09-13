function Price({ format }: { format: () => string }) {
  return <strong>{format()}</strong>;
}

export const content = (
  <article class="coffee">
    <h1>Fresh coffee</h1>
    <Price format={() => "12 EUR"} />
    <svg viewBox="0 0 20 20">
      <path d="M2 10h16" strokeWidth={2} />
    </svg>
  </article>
);

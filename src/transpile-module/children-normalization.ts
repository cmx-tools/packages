export function flattenChildren(input: unknown[], output: unknown[]): void {
  for (const entry of input) {
    if (Array.isArray(entry)) {
      flattenChildren(entry, output);
      continue;
    }

    if (entry === null || entry === false || entry === true) {
      continue;
    }

    output.push(entry);
  }
}

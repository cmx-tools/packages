export function flattenChildren(input: unknown[], output: unknown[]): void {
  for (const entry of input) {
    if (Array.isArray(entry)) {
      flattenChildren(entry, output);
      continue;
    }
    output.push(entry);
  }
}

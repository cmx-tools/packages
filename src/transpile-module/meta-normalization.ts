export function normalizeMeta(compiledModule: Record<string, unknown>): unknown {
  return Object.prototype.hasOwnProperty.call(compiledModule, "meta") ? compiledModule.meta : null;
}

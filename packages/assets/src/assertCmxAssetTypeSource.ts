import ts from "typescript";

export function assertCmxAssetTypeSource(
  configPath: string,
  compilerOptions: ts.CompilerOptions,
): (identity: string) => void {
  const program = ts.createProgram([configPath], {
    ...compilerOptions,
    allowJs: true,
    checkJs: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(configPath);
  const module = source && checker.getSymbolAtLocation(source);
  const exported =
    module &&
    checker
      .getExportsOfModule(module)
      .find((symbol) => symbol.name === "default");
  const config =
    exported && source && checker.getTypeOfSymbolAtLocation(exported, source);
  function property(
    type: ts.Type | undefined,
    key: string,
  ): ts.Type | undefined {
    const symbol = type && checker.getPropertyOfType(type, key);
    return (
      symbol && source && checker.getTypeOfSymbolAtLocation(symbol, source)
    );
  }
  return (identity) => {
    const processor = property(
      property(property(config, "assets"), "processors"),
      identity,
    );
    const process = property(processor, "process");
    const signature =
      process && checker.getSignaturesOfType(process, ts.SignatureKind.Call)[0];
    const result =
      signature &&
      checker.getAwaitedType(checker.getReturnTypeOfSignature(signature));
    if (!result || result.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
      throw new Error(
        `Cannot derive asset import types for ${identity}. Export a default ESM config object and preserve the processor's declared return type. Use satisfies CmxConfig for TypeScript configs.`,
      );
    }
  };
}

import path from "node:path";
import { rolldown } from "rolldown";
import {
  CMX_BUNDLE_FILE_NAME,
  type CmxDiagnostic,
  type CmxDocument,
  parseCmxBundleJson,
  type CmxBundle,
} from "cmx-contracts";
import { cmx, type CmxPluginOptions } from "cmx-bundler";
import {
  renderCmxDocuments,
  type RenderCmxDocumentsCompleteResult,
  type RenderCmxDocumentsErrorResult,
  type RenderCmxDocumentsPartialResult,
  type CmxRenderDiagnostic,
} from "cmx-document-renderer";
import { createCmxTestbedWorkspace } from "./createCmxTestbedWorkspace.js";
import { toCmxTestbedBuildDiagnostic } from "./toCmxTestbedBuildDiagnostic.js";

export type RenderCmxTestbedInput = {
  files: Record<string, string>;
  entry?: string;
  entries?: string[];
  externals?: CmxPluginOptions["externals"];
  exports?: CmxPluginOptions["exports"];
  unsupportedValues?: CmxPluginOptions["unsupportedValues"];
};

export type RenderCmxTestbedBundles = {
  bundle: CmxBundle;
  files: Record<string, string>;
  rootDir: string;
  outDir: string;
};

export type RenderCmxTestbedSuccessResult = RenderCmxTestbedBundles & {
  result: "document";
  document: CmxDocument;
  diagnostics: [];
};

export type RenderCmxTestbedErrorResult = RenderCmxTestbedBundles & {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxTestbedBuildErrorResult = {
  result: "error";
  diagnostics: CmxDiagnostic[];
};

export type RenderCmxTestbedCompleteResult = RenderCmxTestbedBundles &
  RenderCmxDocumentsCompleteResult;

export type RenderCmxTestbedPartialResult = RenderCmxTestbedBundles &
  RenderCmxDocumentsPartialResult;

export type RenderCmxTestbedBundleErrorResult = RenderCmxTestbedBundles &
  RenderCmxDocumentsErrorResult;

export type RenderCmxTestbedResult =
  | RenderCmxTestbedSuccessResult
  | RenderCmxTestbedErrorResult
  | RenderCmxTestbedBuildErrorResult
  | RenderCmxTestbedCompleteResult
  | RenderCmxTestbedPartialResult
  | RenderCmxTestbedBundleErrorResult;

export async function renderCmxTestbed(
  input: RenderCmxTestbedInput,
): Promise<RenderCmxTestbedResult> {
  const workspace = await createCmxTestbedWorkspace();
  const rootDir = workspace.rootDir;
  const entry = input.entry ?? "entry.tsx";
  const entryFiles = input.entries
    ? Object.fromEntries(
        input.entries.map((entryPath) => [
          entryNameFromPath(entryPath),
          path.join(rootDir, entryPath),
        ]),
      )
    : path.join(rootDir, entry);
  const fixtureFiles = {
    ...createExternalPackageFixtureFiles(input.externals ?? []),
    ...input.files,
  };
  await workspace.writeSourceFiles(fixtureFiles);
  const hasConsumerPackageJson = Object.prototype.hasOwnProperty.call(
    fixtureFiles,
    "package.json",
  );

  const outDir = path.join(rootDir, "dist");
  const build = await rolldown({
    input: entryFiles,
    plugins: [
      cmx({
        externals: input.externals,
        exports: input.exports ?? defaultExports,
        unsupportedValues: input.unsupportedValues,
        ...(hasConsumerPackageJson ? { cwd: rootDir } : {}),
      }),
    ],
  });

  try {
    const output = await build
      .write({
        dir: outDir,
        entryFileNames: input.entries ? "[name].js" : "entry.js",
      })
      .catch((error: unknown) => {
        throw new CmxTestbedBuildError(toCmxTestbedBuildDiagnostic(error));
      });
    const emittedFileNames = output.output
      .map((item) => item.fileName)
      .sort((a, b) => a.localeCompare(b));
    const files = await workspace.readOutputFiles(outDir, emittedFileNames);
    const bundle = parseCmxBundleJson(files[CMX_BUNDLE_FILE_NAME] ?? "");
    const bundleEntry = bundle.entries[0];
    if (!bundleEntry) {
      throw new Error("CMX testbed bundle has no entry.");
    }

    const bundleResult = {
      bundle,
      files,
      rootDir,
      outDir,
    };

    const renderedDocuments = await renderCmxDocuments({ bundleDir: outDir });

    if (input.entries) {
      return {
        ...renderedDocuments,
        ...bundleResult,
      };
    }

    if (renderedDocuments.result === "complete") {
      const renderedEntry = renderedDocuments.entries[bundleEntry.name];
      return {
        result: "document",
        document: renderedEntry.document,
        diagnostics: [],
        ...bundleResult,
      };
    }

    return {
      result: "error",
      diagnostics: renderedDocuments.diagnostics,
      ...bundleResult,
    };
  } catch (error) {
    if (error instanceof CmxTestbedBuildError) {
      return {
        result: "error",
        diagnostics: [error.diagnostic],
      };
    }
    throw error;
  } finally {
    await build.close();
  }
}

function entryNameFromPath(entryPath: string): string {
  return path.basename(entryPath, path.extname(entryPath));
}

function createExternalPackageFixtureFiles(
  externals: NonNullable<CmxPluginOptions["externals"]>,
): Record<string, string> {
  const packages = [
    ...new Set(
      externals
        .map((external) =>
          typeof external === "string" ? external : external.contract,
        )
        .map(packageNameFromExternal)
        .filter(isString),
    ),
  ];
  if (packages.length === 0) {
    return {};
  }

  return {
    "package.json": `${JSON.stringify(
      {
        name: "cmx-testbed",
        private: true,
        dependencies: Object.fromEntries(
          packages.map((packageName) => [packageName, "^0.0.0"]),
        ),
      },
      null,
      2,
    )}\n`,
    ...Object.fromEntries(
      packages.flatMap((packageName) => [
        [
          packageFixturePath(packageName, "package.json"),
          `${JSON.stringify(
            {
              name: packageName,
              version: "0.0.0",
              type: "module",
              main: "index.js",
            },
            null,
            2,
          )}\n`,
        ],
        [packageFixturePath(packageName, "index.js"), "export default null;\n"],
      ]),
    ),
  };
}

function packageNameFromExternal(external: string): string | undefined {
  const normalized = external.trim().replace(/\/+$/u, "");
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.startsWith("@")) {
    const [scope, name] = normalized.split("/");
    const packageName = scope && name ? `${scope}/${name}` : undefined;
    return packageName === normalized ? packageName : undefined;
  }

  return normalized.includes("/") || normalized.includes("*")
    ? undefined
    : normalized;
}

function packageFixturePath(packageName: string, fileName: string): string {
  return path.join("node_modules", ...packageName.split("/"), fileName);
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

const defaultExports: CmxPluginOptions["exports"] = {
  default: {
    required: true,
    type: {
      from: "cmx-contracts",
      import: "CmxNode",
    },
  },
};

class CmxTestbedBuildError extends Error {
  diagnostic: CmxDiagnostic;

  constructor(diagnostic: CmxDiagnostic) {
    super(diagnostic.message);
    this.name = "CmxTestbedBuildError";
    this.diagnostic = diagnostic;
  }
}

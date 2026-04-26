import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
import { cmx, type CmxArtifact } from "./cmx-bundler/index.js";
import { renderCmxTree, type CmxNode } from "./cmx-tree-renderer/index.js";

export type RenderCmxTestbedInput = {
  files: Record<string, string>;
  entry?: string;
};

export type RenderCmxTestbedResult = {
  tree: CmxNode;
  artifact: CmxArtifact;
  files: Record<string, string>;
  rootDir: string;
  outDir: string;
};

export async function renderCmxTestbed(
  input: RenderCmxTestbedInput,
): Promise<RenderCmxTestbedResult> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "cmx-testbed-"));
  const entry = input.entry ?? "entry.tsx";
  const entryFile = path.join(rootDir, entry);
  await writeSourceFiles(rootDir, input.files);

  const outDir = path.join(rootDir, "dist");
  const bundle = await rolldown({
    input: entryFile,
    plugins: [cmx()],
  });

  try {
    const output = await bundle.write({
      dir: outDir,
      entryFileNames: "entry.js",
    });
    const emittedFileNames = output.output
      .map((item) => item.fileName)
      .sort((a, b) => a.localeCompare(b));
    await writeRuntimePackage(outDir);

    const files = await readOutputFiles(outDir, emittedFileNames);
    const artifact = JSON.parse(
      files["cmx-artifact.json"] ?? "",
    ) as CmxArtifact;
    const artifactEntry = artifact.entries[0];
    if (!artifactEntry) {
      throw new Error("CMX testbed artifact has no entry.");
    }

    const tree = await renderCmxTree({
      moduleUrl: pathToFileURL(path.join(outDir, artifactEntry.file)),
    });

    return {
      tree,
      artifact,
      files,
      rootDir,
      outDir,
    };
  } finally {
    await bundle.close();
  }
}

async function writeSourceFiles(
  rootDir: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, source]) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source, "utf8");
    }),
  );
}

async function readOutputFiles(
  outDir: string,
  fileNames: string[],
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await Promise.all(
    fileNames.map(async (fileName) => {
      files[fileName] = await readFile(path.join(outDir, fileName), "utf8");
    }),
  );
  return files;
}

async function writeRuntimePackage(outDir: string): Promise<void> {
  const packageDir = path.join(outDir, "node_modules", "@cmx", "runtime");
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@cmx/runtime",
        type: "module",
        exports: {
          "./jsx-runtime": "./jsx-runtime.js",
          "./jsx-dev-runtime": "./jsx-runtime.js",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(packageDir, "jsx-runtime.js"),
    RUNTIME_SOURCE,
    "utf8",
  );
}

const RUNTIME_SOURCE = String.raw`
const RUNTIME_NODE_MARKER_KEY = Symbol.for("cmx.runtime-node-marker");
const externalRefs = new WeakMap();

export const Fragment = Symbol.for("cmx.fragment");

export function __registerExternal(ref) {
  function ExternalReference() {
    throw new Error("External component must be used as JSX.");
  }

  Object.defineProperty(ExternalReference, "__cmxExternalRef", {
    value: true,
  });
  externalRefs.set(ExternalReference, ref);
  return ExternalReference;
}

export function jsx(type, props) {
  return createRuntimeNode(type, props);
}

export function jsxs(type, props) {
  return createRuntimeNode(type, props);
}

function createRuntimeNode(type, props) {
  const inputProps = props ?? {};
  const hasChildren = Object.prototype.hasOwnProperty.call(inputProps, "children");
  const rawChildren = hasChildren ? inputProps.children : undefined;
  const children = hasChildren
    ? Array.isArray(rawChildren)
      ? rawChildren
      : [rawChildren]
    : [];
  const { children: _ignoredChildren, ...rest } = inputProps;

  if (type === Fragment) {
    return markRuntimeNode({ kind: "fragment", children });
  }

  if (typeof type === "string") {
    return markRuntimeNode({
      kind: "element",
      tag: type,
      ...(Object.keys(rest).length > 0 ? { props: rest } : {}),
      ...(children.length > 0 ? { children } : {}),
    });
  }

  if (typeof type === "function") {
    const externalRef = externalRefs.get(type);
    if (externalRef) {
      return markRuntimeNode({
        kind: "component",
        from: externalRef.from,
        import: externalRef.import ?? externalRef.importName,
        ...(Object.keys(rest).length > 0 ? { props: rest } : {}),
        ...(children.length > 0 ? { children } : {}),
      });
    }

    return type(hasChildren ? { ...rest, children: rawChildren } : rest);
  }

  throw new Error("Unsupported JSX element type.");
}

function markRuntimeNode(node) {
  Object.defineProperty(node, RUNTIME_NODE_MARKER_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });
  return node;
}
`.trimStart();

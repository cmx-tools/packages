import { readFile, rm } from "node:fs/promises";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { expect, it } from "vitest";
import { runCmxBundleCli } from "@cmx-tools/bundle/cli";
import { renderCmxDocuments } from "@cmx-tools/document";
import { cmx } from "@cmx-tools/react";
import type { CmxNode } from "@cmx-tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";
import { publishCmxDocuments } from "@cmx-tools/publish";
import { CMX_DOCUMENT_SCHEMA, type CmxDocument } from "@cmx-tools/contracts";
import { createDocumentHostTestServer } from "./createDocumentHostTestServer.js";
import { createCmxTestbedWorkspace } from "./createCmxTestbedWorkspace.js";

it("renders project-processed Asset metadata and final URLs into Document Content", async () => {
  const workspace = await createCmxTestbedWorkspace();
  await workspace.writeSourceFiles({
    "package.json": '{"name":"asset-content","type":"module"}',
    "photo.svg": '<svg width="20" height="10"></svg>',
    "page.tsx": `import photo from "./photo.svg";
      import type {CmxAssetJson} from "@cmx-tools/contracts";
      export default <img src={photo.preview} width={photo.width} />;
      export const meta: CmxAssetJson = photo;
    `,
    "cmx.config.ts": `import {appendFile, mkdir} from "node:fs/promises";
      export default {
      exports: {
        default: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxNode"}},
        meta: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxAssetJson"}}
      },
      assets: {
        cacheDir: ".cmx/assets",
        storage: {async store({key}) {return "https://assets.example/" + key;}},
        processors: {
          photo: {
            version: "1", extensions: [".svg"], options: {},
            async process({bytes, file, emit}) {
              await mkdir(new URL(".cmx", import.meta.url), {recursive: true});
              await appendFile(new URL(".cmx/processed", import.meta.url), "1");
              const preview = new TextDecoder().decode(bytes).replace('width="20"', 'width="10"');
              return {src: file(".svg"), width: 20, preview: emit(new TextEncoder().encode(preview), ".svg"), colors: ["red"]};
            }
          }
        }
      }
    };`,
  });
  try {
    expect(
      await runCmxBundleCli([
        "compile",
        "page.tsx",
        "dist",
        "--cwd",
        workspace.rootDir,
      ]),
    ).toBe(0);
    const result = await renderCmxDocuments({
      bundleDir: path.join(workspace.rootDir, "dist"),
    });
    expect(result.result, JSON.stringify(result)).toBe("complete");
    if (result.result !== "complete")
      throw new Error("Asset Document Rendering failed");
    expect(result.entries.page.document.content.meta).toEqual({
      src: expect.stringMatching(/^https:\/\/assets\.example\/.+\.svg$/),
      width: 20,
      preview: expect.stringMatching(/^https:\/\/assets\.example\/.+\.svg$/),
      colors: ["red"],
    });
    const meta = result.entries.page.document.content.meta as {
      preview: string;
      src: string;
    };
    expect(meta.preview).not.toBe(meta.src);
    expect(result.entries.page.document.content.default).toMatchObject({
      props: { src: meta.preview, width: 20 },
    });
    expect(
      renderToStaticMarkup(
        cmx<{ default: CmxNode }>(result.entries.page.document).default,
      ),
    ).toContain(`src="${meta.preview}" width="20"`);
    expect(
      await runCmxBundleCli([
        "compile",
        "page.tsx",
        "dist",
        "--cwd",
        workspace.rootDir,
      ]),
    ).toBe(0);
    expect(
      await readFile(path.join(workspace.rootDir, ".cmx/processed"), "utf8"),
    ).toBe("1");
  } finally {
    await rm(workspace.rootDir, { recursive: true, force: true });
  }
});

it("prepares Asset import types from declared processor output before CI typechecking", async () => {
  const workspace = await createCmxTestbedWorkspace();
  await workspace.writeSourceFiles({
    "package.json": '{"name":"typed-assets","type":"module"}',
    "photo.svg": '<svg width="20" height="10"></svg>',
    "page.ts": `import photo from "./photo.svg"; export default photo;`,
    "cmx.config.ts": `import {defineCmxAssetProcessor, type CmxAssetFile} from "@cmx-tools/assets";
      import type {CmxConfig} from "@cmx-tools/contracts";
      const photo = defineCmxAssetProcessor({
        version: "1", extensions: [".svg"], options: {width: 20},
        process({file, options}): {src: CmxAssetFile; width: number; colors: Array<"red" | "blue">; caption?: string} {
          return {src: file(".svg"), width: options.width, colors: ["red"], caption: undefined};
        }
      });
      export default {exports: {default: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxAssetJson"}}}, assets: {
        processors: {photo},
        storage: {async store({key}) {return "https://assets.example/" + key;}}
      }} satisfies CmxConfig;
    `,
    "authoring.ts": `import photo from "./photo.svg";
      const width: number = photo.width;
      const url: string = photo.src;
      const color: (typeof photo.colors)[number] = "blue";
      const caption: string | undefined = photo.caption;
      // @ts-expect-error Unknown metadata field
      photo.missing;
      // @ts-expect-error Width is numeric
      const wrong: string = photo.width;
      // @ts-expect-error Output references resolve to URL strings
      photo.src.$cmxAsset;
    `,
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        allowArbitraryExtensions: true,
        types: ["node"],
      },
      include: ["authoring.ts"],
    }),
  });
  try {
    const before = typecheck(workspace.rootDir);
    expect(before.status).not.toBe(0);
    expect(
      await runCmxBundleCli([
        "compile",
        "page.ts",
        "dist",
        "--cwd",
        workspace.rootDir,
      ]),
    ).toBe(0);
    const after = typecheck(workspace.rootDir);
    expect(after.status, after.stdout + after.stderr).toBe(0);
  } finally {
    await rm(workspace.rootDir, { recursive: true, force: true });
  }
});

function typecheck(cwd: string) {
  return spawnSync(
    path.resolve("node_modules/.bin/tsgo"),
    ["-p", path.join(cwd, "tsconfig.json")],
    { encoding: "utf8", timeout: 30_000 },
  );
}

it.each(["processing", "storage"])(
  "preserves published Documents when Asset %s fails",
  async (failure) => {
    const workspace = await createCmxTestbedWorkspace();
    const host = createCmxDocumentHost({
      store: createMemoryCmxDocumentStore(),
    });
    const server = await createDocumentHostTestServer((request) =>
      host.handlePublication(request),
    );
    const previous: CmxDocument = {
      $schema: CMX_DOCUMENT_SCHEMA,
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: {} } },
      content: { default: "Previous page" },
    };
    try {
      await publishCmxDocuments({
        endpoint: server.endpoint,
        documents: { page: previous },
      });
      await workspace.writeSourceFiles({
        "package.json": '{"name":"asset-publication","type":"module"}',
        "photo.svg": '<svg width="20" height="10"></svg>',
        "page.ts": 'import photo from "./photo.svg"; export default photo;',
        "cmx.config.ts": `export default {
        exports: {default: {required: true}},
        assets: {
          processors: {photo: {
            version: "1", extensions: [".svg"],
            process({file}) {${failure === "processing" ? 'throw new Error("Processor failed");' : 'return {src: file(".svg")};'}}
          }},
          storage: {async store() {throw new Error("Storage failed");}}
        }
      };`,
      });
      const result = await promisify(execFile)(
        "sh",
        [
          "-c",
          'cmx-bundle compile page.ts dist && cmx-document render dist --complete-only | cmx-publish - "$CMX_ENDPOINT"',
        ],
        {
          cwd: workspace.rootDir,
          env: {
            ...process.env,
            PATH: `${path.resolve("node_modules/.bin")}${path.delimiter}${process.env.PATH}`,
            CMX_ENDPOINT: server.endpoint,
          },
          timeout: 30_000,
        },
      ).catch((error: unknown) => error);
      expect(result).toBeInstanceOf(Error);
      expect(result).toMatchObject({
        stderr: expect.stringContaining(
          failure === "processing" ? "Processor failed" : "Storage failed",
        ),
      });
      expect(await host.getDocument("page")).toEqual(previous);
    } finally {
      await server.close();
      await rm(workspace.rootDir, { recursive: true, force: true });
    }
  },
);

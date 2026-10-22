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
    "cmx.config.ts": `import {appendFile, mkdir, writeFile} from "node:fs/promises";
      import {createHash} from "node:crypto";
      export default {
      exports: {
        default: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxNode"}},
        meta: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxAssetJson"}}
      },
      assets: {
        cacheDir: ".cmx/assets",
        processors: {
          photo: {
            version: "1", extensions: [".svg"], options: {publicBaseUrl: "https://assets.example"},
            async process({bytes, relativePath, options}) {
              await mkdir(new URL(".cmx", import.meta.url), {recursive: true});
              await appendFile(new URL(".cmx/processed", import.meta.url), "1");
              async function store(svg) {
                const key = createHash("sha256").update(svg).digest("hex") + ".svg";
                await writeFile(new URL(".cmx/" + key, import.meta.url), svg);
                await appendFile(new URL(".cmx/stored", import.meta.url), "1");
                return options.publicBaseUrl + "/" + key;
              }
              const preview = new TextDecoder().decode(bytes).replace('width="20"', 'width="10"');
              return {src: await store(bytes), name: relativePath, width: 20, preview: await store(new TextEncoder().encode(preview)), colors: ["red"]};
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
      name: "photo.svg",
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
    expect(
      await readFile(path.join(workspace.rootDir, ".cmx/stored"), "utf8"),
    ).toBe("11");
    await workspace.writeSourceFiles({
      "cmx.config.ts": (
        await readFile(path.join(workspace.rootDir, "cmx.config.ts"), "utf8")
      ).replace("https://assets.example", "https://cdn.example"),
    });
    expect(
      await runCmxBundleCli([
        "compile",
        "page.tsx",
        "production",
        "--cwd",
        workspace.rootDir,
      ]),
    ).toBe(0);
    const production = await renderCmxDocuments({
      bundleDir: path.join(workspace.rootDir, "production"),
    });
    expect(production.result).toBe("complete");
    if (production.result !== "complete")
      throw new Error("Production Asset Document Rendering failed");
    expect(production.entries.page.document.content.meta).toMatchObject({
      src: expect.stringMatching(/^https:\/\/cdn\.example\//u),
      preview: expect.stringMatching(/^https:\/\/cdn\.example\//u),
    });
    expect(
      await readFile(path.join(workspace.rootDir, ".cmx/processed"), "utf8"),
    ).toBe("11");
    expect(
      await readFile(path.join(workspace.rootDir, ".cmx/stored"), "utf8"),
    ).toBe("1111");
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
    "cmx.config.ts": `import type {CmxAssetProcessor} from "@cmx-tools/assets";
      import type {CmxConfig} from "@cmx-tools/contracts";
      const photo = {
        version: "1", extensions: [".svg"], options: {width: 20, publicBaseUrl: "https://assets.example"},
        process({relativePath, options}): {src: string; width: number; colors: Array<"red" | "blue">; caption?: string} {
          return {src: options.publicBaseUrl + "/" + relativePath, width: options.width, colors: ["red"], caption: undefined};
        }
      } satisfies CmxAssetProcessor<{width: number; publicBaseUrl: string}>;
      export default {exports: {default: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxAssetJson"}}}, assets: {
        processors: {photo}
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
      // @ts-expect-error Colors use the declared project union
      photo.colors.push("green");
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
        "cmx.config.ts": `import {writeFile} from "node:fs/promises";
        export default {
        exports: {default: {required: true}},
        assets: {
          processors: {photo: {
            version: "1", extensions: [".svg"],
            async process({bytes}) {${failure === "processing" ? 'throw new Error("Processor failed");' : 'await writeFile(new URL("missing-directory/photo.svg", import.meta.url), bytes).catch((cause) => {throw new Error("Storage failed", {cause});}); return {src: "/assets/photo.svg"};'}}
          }}
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

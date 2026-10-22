import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import {
  createCmxAssetPipeline,
  createLocalAssetStorage,
  defineCmxAssetProcessor,
} from "@cmx-tools/assets";
import type { CmxAssetsConfig } from "@cmx-tools/contracts";

const projects: string[] = [];

afterEach(async () => {
  await Promise.all(
    projects
      .splice(0)
      .map((project) => rm(project, { recursive: true, force: true })),
  );
});

test("a Content Project imports processor metadata and stored original and derived files", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "photo.svg"), '<svg width="40" height="20"/>');
  const pipeline = createCmxAssetPipeline({
    cwd,
    assets: {
      processors: {
        image: {
          version: "1",
          extensions: [".svg"],
          process(input) {
            return {
              src: input.file(".svg"),
              width: 40,
              colors: ["red"],
              thumbnail: input.emit(
                Buffer.from('<svg width="10" height="5"/>'),
                ".svg",
              ),
            };
          },
        },
      },
      storage: createLocalAssetStorage({
        directory: path.join(cwd, "public"),
        publicBaseUrl: pathToFileURL(path.join(cwd, "public/")).href,
      }),
    },
  });

  const value = (await pipeline.load("photo.svg")) as {
    src: string;
    width: number;
    colors: string[];
    thumbnail: string;
  };

  expect(value).toEqual({
    src: expect.stringMatching(/^file:.*[a-f0-9]{64}\.svg$/),
    width: 40,
    colors: ["red"],
    thumbnail: expect.stringMatching(/^file:.*[a-f0-9]{64}\.svg$/),
  });
  expect(await readFile(new URL(value.src), "utf8")).toBe(
    '<svg width="40" height="20"/>',
  );
  expect(await readFile(new URL(value.thumbnail), "utf8")).toBe(
    '<svg width="10" height="5"/>',
  );
});

test("unchanged Assets reuse processing across concurrent imports and separate destinations", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "photo.jpg"), "image bytes");
  await writeFile(path.join(cwd, "copy.jpeg"), "image bytes");
  let processing = 0;
  const assets: CmxAssetsConfig = {
    processors: {
      image: {
        extensions: [".jpg", ".jpeg"],
        version: "1",
        process(input) {
          processing += 1;
          return { src: input.file(".jpg"), width: 40 };
        },
      },
    },
    storage: createLocalAssetStorage({
      directory: path.join(cwd, "development"),
      publicBaseUrl: "/development",
    }),
  };
  const development = createCmxAssetPipeline({ cwd, assets });
  expect(
    await Promise.all([
      development.load("photo.jpg"),
      development.load("copy.jpeg"),
    ]),
  ).toEqual([
    { src: expect.stringMatching(/^\/development\/.*\.jpg$/), width: 40 },
    { src: expect.stringMatching(/^\/development\/.*\.jpg$/), width: 40 },
  ]);
  const production = createCmxAssetPipeline({
    cwd,
    assets: {
      ...assets,
      storage: createLocalAssetStorage({
        directory: path.join(cwd, "production"),
        publicBaseUrl: "https://assets.example.com",
      }),
    },
  });
  expect(await production.load("photo.jpg")).toEqual({
    src: expect.stringMatching(/^https:\/\/assets.example.com\/.*\.jpg$/),
    width: 40,
  });
  expect(processing).toBe(1);
});

test("CI preparation types imported fields from the declared processor result without uploading", async () => {
  const cwd = await project();
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  await writeFile(path.join(cwd, "photo.svg"), "image");
  await writeFile(
    path.join(cwd, "cmx.config.ts"),
    `
    import { defineCmxAssetProcessor, createLocalAssetStorage } from '@cmx-tools/assets';
    import type { CmxConfig } from '@cmx-tools/contracts';
    type Color = 'warm' | 'cool';
    export default {
      assets: {
        processors: { image: defineCmxAssetProcessor({
          version: '1', extensions: ['.svg'],
          process(input) { return { src: input.file('.svg'), width: 40, colors: ['warm'] as Color[] }; }
        }) },
        storage: createLocalAssetStorage({ directory: './public', publicBaseUrl: '/assets' })
      }
    } satisfies CmxConfig;
  `,
  );
  await writeFile(
    path.join(cwd, "content.ts"),
    `
    import photo from './photo.svg';
    const width: number = photo.width;
    const url: string = photo.src;
    const color: 'warm' | 'cool' = photo.colors[0];
    // @ts-expect-error Width is declared number, never the extracted literal.
    const literal: 40 = photo.width;
    // @ts-expect-error Unknown metadata is unavailable.
    photo.missing;
    // @ts-expect-error Declared color union survives preparation.
    const wrong: 'green' = photo.colors[0];
    export default { width, url, color };
  `,
  );
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        allowArbitraryExtensions: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["*.ts"],
    }),
  );
  const pipeline = createCmxAssetPipeline({
    cwd,
    assets: {
      processors: {
        image: {
          version: "1",
          extensions: [".svg"],
          process: (input) => ({
            src: input.file(".svg"),
            width: 40,
            colors: ["warm"],
          }),
        },
      },
      storage: {
        async store() {
          throw new Error("Preparation must not upload");
        },
      },
    },
  });

  await pipeline.prepare({
    entries: ["content.ts"],
    configPath: "cmx.config.ts",
  });
  await expect(
    promisify(execFile)(
      path.resolve(import.meta.dirname, "../../../node_modules/.bin/tsgo"),
      ["-p", path.join(cwd, "tsconfig.json")],
    ),
  ).resolves.toMatchObject({ stderr: "" });
});

test("fresh Content Projects prepare aliased Assets through transitive source imports", async () => {
  const cwd = await project();
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  await writeFile(path.join(cwd, "photo.svg"), "image");
  await writeFile(
    path.join(cwd, "cmx.config.ts"),
    `
    import { defineCmxAssetProcessor } from '@cmx-tools/assets';
    import type { CmxConfig } from '@cmx-tools/contracts';
    export default { assets: {
      processors: { image: defineCmxAssetProcessor({
        version: '1', extensions: ['.svg'],
        process(input) { return { src: input.file('.svg'), width: 40 }; }
      }) },
      storage: { async store() { return '/assets'; } }
    } } satisfies CmxConfig;
  `,
  );
  await writeFile(
    path.join(cwd, "details.ts"),
    `
    import photo from '@media/photo.svg';
    // @ts-expect-error Missing source files remain unresolved.
    import missing from '@media/missing.svg';
    export { photo };
  `,
  );
  await writeFile(
    path.join(cwd, "content.ts"),
    `
    import { photo } from '@content/details.js';
    const width: number = photo.width;
    const src: string = photo.src;
    // @ts-expect-error Aliased imports preserve the declared metadata fields.
    photo.missing;
    export default { width, src };
  `,
  );
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        allowArbitraryExtensions: true,
        noEmit: true,
        skipLibCheck: true,
        paths: { "@media/*": ["./*"], "@content/*": ["./*"] },
      },
      include: ["*.ts"],
    }),
  );
  const pipeline = createCmxAssetPipeline({
    cwd,
    assets: {
      processors: {
        image: {
          version: "1",
          extensions: [".svg"],
          process: (input) => ({ src: input.file(".svg"), width: 40 }),
        },
      },
      storage: {
        async store() {
          throw new Error("Preparation must not upload");
        },
      },
    },
  });

  await pipeline.prepare({
    entries: ["content.ts"],
    configPath: "cmx.config.ts",
  });

  await expect(
    promisify(execFile)(
      path.resolve(import.meta.dirname, "../../../node_modules/.bin/tsgo"),
      ["-p", path.join(cwd, "tsconfig.json")],
    ),
  ).resolves.toMatchObject({ stderr: "" });
});

test("source, processor version and configured options invalidate only affected processing", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "first.svg"), "first");
  await writeFile(path.join(cwd, "second.svg"), "second");
  await writeFile(path.join(cwd, "note.txt"), "note");
  const processed: string[] = [];
  const build = async (version = "1", width = 40) => {
    const pipeline = createCmxAssetPipeline({
      cwd,
      assets: {
        processors: {
          image: defineCmxAssetProcessor({
            version,
            extensions: [".svg"],
            options: { width },
            process(input) {
              processed.push(Buffer.from(input.bytes).toString());
              return { src: input.file(".svg"), width: input.options.width };
            },
          }),
          note: {
            version: "1",
            extensions: [".txt"],
            process(input) {
              processed.push("note");
              return { src: input.file(".txt") };
            },
          },
        },
        storage: createLocalAssetStorage({
          directory: path.join(cwd, "public"),
          publicBaseUrl: "/assets",
        }),
      },
    });
    return Promise.all([
      pipeline.load("first.svg"),
      pipeline.load("second.svg"),
      pipeline.load("note.txt"),
    ]);
  };
  await build();
  expect(processed.splice(0).sort()).toEqual(["first", "note", "second"]);
  await writeFile(path.join(cwd, "first.svg"), "changed first");
  await build();
  expect(processed.splice(0)).toEqual(["changed first"]);
  await build("2");
  expect(processed.splice(0).sort()).toEqual(["changed first", "second"]);
  expect(await build("2", 80)).toMatchObject([
    { width: 80 },
    { width: 80 },
    {},
  ]);
  expect(processed.sort()).toEqual(["changed first", "second"]);
});

test("preparation reports a config annotation that erases imported metadata types", async () => {
  const cwd = await project();
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  await writeFile(path.join(cwd, "photo.svg"), "image");
  await writeFile(
    path.join(cwd, "content.ts"),
    "import photo from './photo.svg'; export default photo;",
  );
  await writeFile(
    path.join(cwd, "cmx.config.ts"),
    `import type { CmxConfig } from '@cmx-tools/contracts'; const config: CmxConfig = { assets: { processors: { image: { version: '1', extensions: ['.svg'], process() { return { width: 40 }; } } }, storage: { async store() { return '/assets'; } } } }; export default config;`,
  );
  const pipeline = createCmxAssetPipeline({
    cwd,
    assets: {
      processors: {
        image: {
          version: "1",
          extensions: [".svg"],
          process: () => ({ width: 40 }),
        },
      },
      storage: {
        async store() {
          return "/assets";
        },
      },
    },
  });
  await expect(
    pipeline.prepare({ entries: ["content.ts"], configPath: "cmx.config.ts" }),
  ).rejects.toThrow(/satisfies CmxConfig/);
});

test("concurrent builds publish complete shared files and preserve emitted byte snapshots", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "photo.svg"), "source");
  const build = () =>
    createCmxAssetPipeline({
      cwd,
      assets: {
        processors: {
          image: {
            version: "1",
            extensions: [".svg"],
            async process(input) {
              const working = Buffer.alloc(1024 * 1024, 7);
              const thumbnail = input.emit(working, ".svg");
              working.fill(9);
              await new Promise<void>((resolve) => setImmediate(resolve));
              return { thumbnail };
            },
          },
        },
        storage: createLocalAssetStorage({
          directory: path.join(cwd, "public"),
          publicBaseUrl: pathToFileURL(path.join(cwd, "public/")).href,
        }),
      },
    }).load("photo.svg");
  const documents = (await Promise.all([build(), build()])) as {
    thumbnail: string;
  }[];
  expect(documents[0]).toEqual(documents[1]);
  expect(await readFile(new URL(documents[0].thumbnail))).toEqual(
    Buffer.alloc(1024 * 1024, 7),
  );
});

async function project() {
  const cwd = await mkdtemp(path.join(process.cwd(), ".cmx-assets-test-"));
  projects.push(cwd);
  return cwd;
}

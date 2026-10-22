import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import {
  createCmxAssetPipeline,
  type CmxAssetProcessor,
} from "@cmx-tools/assets";

const projects: string[] = [];

afterEach(async () => {
  await Promise.all(
    projects
      .splice(0)
      .map((project) => rm(project, { recursive: true, force: true })),
  );
});

test("Content Projects cache the complete hook result and skip project uploads on cache hits", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "photo.svg"), '<svg width="40" height="20"/>');
  let processed = 0;
  let uploaded = 0;
  const image = {
    version: "1",
    extensions: [".svg"],
    options: { baseUrl: "https://cdn.example.test" },
    async process({ bytes, relativePath, options }) {
      processed += 1;
      await writeFile(path.join(cwd, "uploaded.svg"), bytes);
      uploaded += 1;
      return {
        src: `${options.baseUrl}/${relativePath}`,
        width: 40,
        colors: ["red"],
        caption: undefined,
        provider: { $cmxAsset: "project-owned" },
      };
    },
  } satisfies CmxAssetProcessor<{ baseUrl: string }>;
  const assets = { processors: { image } };
  const pipeline = createCmxAssetPipeline({ cwd, assets });
  const expected = {
    src: "https://cdn.example.test/photo.svg",
    width: 40,
    colors: ["red"],
    provider: { $cmxAsset: "project-owned" },
  };

  const imported = await Promise.all([
    pipeline.load("photo.svg"),
    pipeline.load("photo.svg"),
  ]);
  expect(imported).toEqual([expected, expected]);
  (imported[0] as { colors: string[] }).colors.push("blue");
  expect(imported[1]).toEqual(expected);
  expect(await pipeline.load("photo.svg")).toEqual(expected);
  expect(
    await createCmxAssetPipeline({ cwd, assets }).load("photo.svg"),
  ).toEqual(expected);
  expect({ processed, uploaded }).toEqual({ processed: 1, uploaded: 1 });
  expect(await readFile(path.join(cwd, "uploaded.svg"), "utf8")).toBe(
    '<svg width="40" height="20"/>',
  );
});

test("processors distinguish relative paths and normalize files outside the project", async () => {
  const root = await project();
  const cwd = path.join(root, "content");
  await mkdir(path.join(cwd, "images"), { recursive: true });
  await Promise.all([
    writeFile(path.join(cwd, "images/photo.svg"), "same image"),
    writeFile(path.join(cwd, "images/copy.svg"), "same image"),
    writeFile(path.join(root, "photo.svg"), "same image"),
  ]);
  const processed: string[] = [];
  const assets = {
    processors: {
      image: {
        version: "1",
        extensions: [".svg"],
        process({ relativePath }) {
          processed.push(relativePath);
          return {
            name: relativePath,
            src: `https://cdn.example.test/${encodeURIComponent(relativePath)}`,
          };
        },
      } satisfies CmxAssetProcessor,
    },
  };
  const filenames = [
    "images/../images/photo.svg",
    "images/copy.svg",
    "../photo.svg",
  ];
  const build = () => {
    const pipeline = createCmxAssetPipeline({ cwd, assets });
    return Promise.all(filenames.map((filename) => pipeline.load(filename)));
  };
  const expected = [
    {
      name: "images/photo.svg",
      src: "https://cdn.example.test/images%2Fphoto.svg",
    },
    {
      name: "images/copy.svg",
      src: "https://cdn.example.test/images%2Fcopy.svg",
    },
    { name: "../photo.svg", src: "https://cdn.example.test/..%2Fphoto.svg" },
  ];
  expect(await build()).toEqual(expected);
  expect(await build()).toEqual(expected);
  expect(processed.sort()).toEqual([
    "../photo.svg",
    "images/copy.svg",
    "images/photo.svg",
  ]);
});

test("failed project uploads and invalid metadata can be corrected without caching failed work", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "photo.svg"), "image");
  let attempts = 0;
  const assets = {
    processors: {
      image: {
        version: "1",
        extensions: [".svg"],
        async process() {
          attempts += 1;
          if (attempts === 1) throw new Error("Project upload unavailable");
          if (attempts === 2) return { uploadedAt: new Date() };
          return {
            src: "https://cdn.example.test/photo.svg",
            caption: undefined,
          };
        },
      },
    },
  };
  const pipeline = createCmxAssetPipeline({ cwd, assets });
  await expect(pipeline.load("photo.svg")).rejects.toThrow(
    "Project upload unavailable",
  );
  await expect(pipeline.load("photo.svg")).rejects.toThrow("plain objects");
  expect(await pipeline.load("photo.svg")).toEqual({
    src: "https://cdn.example.test/photo.svg",
  });
  expect(
    await createCmxAssetPipeline({ cwd, assets }).load("photo.svg"),
  ).toEqual({ src: "https://cdn.example.test/photo.svg" });
  expect(attempts).toBe(3);
});

test("Content Projects type imported metadata from the declared processor result", async () => {
  const cwd = await project();
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  await writeFile(path.join(cwd, "photo.svg"), "image");
  await writeFile(
    path.join(cwd, "cmx.config.ts"),
    `
    import type { CmxConfig } from '@cmx-tools/contracts';
    import type { CmxAssetProcessor } from '@cmx-tools/assets';
    type Color = 'warm' | 'cool';
    type Image = { src: string; width: number; colors: Color[]; caption?: string };
    const image = {
      version: '1', extensions: ['.svg'],
      options: { width: 40 },
      process({ relativePath, options }): Image {
        return { src: 'https://cdn.example.test/' + relativePath, width: options.width, colors: ['warm'], caption: undefined };
      }
    } satisfies CmxAssetProcessor<{ width: number }>;
    export default { assets: { processors: { image } } } satisfies CmxConfig;
  `,
  );
  await writeFile(
    path.join(cwd, "content.ts"),
    `
    import photo from './photo.svg';
    const width: number = photo.width;
    const url: string = photo.src;
    const color: 'warm' | 'cool' = photo.colors[0];
    const caption: string | undefined = photo.caption;
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
            src: `https://cdn.example.test/${input.relativePath}`,
            width: 40,
            colors: ["warm"],
          }),
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
    import type { CmxAssetProcessor } from '@cmx-tools/assets';
    import type { CmxConfig } from '@cmx-tools/contracts';
    const image = {
      version: '1', extensions: ['.svg'],
      process({ relativePath }) { return { src: 'https://cdn.example.test/' + relativePath, width: 40 }; }
    } satisfies CmxAssetProcessor;
    export default { assets: { processors: { image } } } satisfies CmxConfig;
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
          process: (input) => ({
            src: `https://cdn.example.test/${input.relativePath}`,
            width: 40,
          }),
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

test.each(["js", "mjs"])(
  "ESM %s configs prepare imported metadata before the project enables JavaScript typechecking",
  async (extension) => {
    const cwd = await project();
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    await writeFile(path.join(cwd, "photo.svg"), "image");
    const configPath = `cmx.config.${extension}`;
    await writeFile(
      path.join(cwd, configPath),
      `
    const image = /** @satisfies {import('@cmx-tools/assets').CmxAssetProcessor<{ width: number }>} */ ({
      version: '1', extensions: ['.svg'], options: { width: 40 },
      process(input) {
        return {
          src: 'https://cdn.example.test/' + input.relativePath, width: input.options.width,
          colors: /** @type {('warm' | 'cool')[]} */ (['warm'])
        };
      }
    });
    export default { assets: { processors: { image } } };
  `,
    );
    await writeFile(
      path.join(cwd, "content.ts"),
      `
    import photo from './photo.svg';
    const width: number = photo.width;
    const src: string = photo.src;
    const color: 'warm' | 'cool' = photo.colors[0];
    // @ts-expect-error JavaScript config numeric fields remain typed.
    const wrongWidth: string = photo.width;
    // @ts-expect-error JavaScript config metadata retains its declared fields.
    photo.missing;
    // @ts-expect-error JSDoc metadata unions survive preparation.
    const wrong: 'green' = photo.colors[0];
    export default { width, src, color };
  `,
    );
    const compilerOptions = {
      strict: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      allowArbitraryExtensions: true,
      noEmit: true,
      skipLibCheck: true,
    };
    await writeFile(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({ compilerOptions, include: ["*.ts"] }),
    );
    const pipeline = createCmxAssetPipeline({
      cwd,
      assets: {
        processors: {
          image: {
            version: "1",
            extensions: [".svg"],
            process: (input) => ({
              src: `https://cdn.example.test/${input.relativePath}`,
              width: 40,
              colors: ["warm"],
            }),
          },
        },
      },
    });

    await pipeline.prepare({ entries: ["content.ts"], configPath });
    await writeFile(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { ...compilerOptions, allowJs: true },
        include: ["*.ts"],
      }),
    );

    await expect(
      promisify(execFile)(
        path.resolve(import.meta.dirname, "../../../node_modules/.bin/tsgo"),
        ["-p", path.join(cwd, "tsconfig.json")],
      ),
    ).resolves.toMatchObject({ stderr: "" });
  },
);

test("source, processor version and configured options invalidate only affected processing", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "first.svg"), "first");
  await writeFile(path.join(cwd, "second.svg"), "second");
  await writeFile(path.join(cwd, "note.txt"), "note");
  const processed: string[] = [];
  const build = async (
    version = "1",
    width = 40,
    baseUrl = "https://development.example.test",
  ) => {
    const pipeline = createCmxAssetPipeline({
      cwd,
      assets: {
        processors: {
          image: {
            version,
            extensions: [".svg"],
            options: { width, baseUrl },
            process(input) {
              processed.push(Buffer.from(input.bytes).toString());
              return {
                src: `${input.options.baseUrl}/${input.relativePath}`,
                width: input.options.width,
              };
            },
          } satisfies CmxAssetProcessor<{ width: number; baseUrl: string }>,
          note: {
            version: "1",
            extensions: [".txt"],
            process(input) {
              processed.push("note");
              return { src: `https://cdn.example.test/${input.relativePath}` };
            },
          },
        },
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
  expect(processed.splice(0).sort()).toEqual(["changed first", "second"]);
  expect(await build("2", 80, "https://production.example.test")).toMatchObject(
    [
      { src: "https://production.example.test/first.svg" },
      { src: "https://production.example.test/second.svg" },
      { src: "https://cdn.example.test/note.txt" },
    ],
  );
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
    `import type { CmxConfig } from '@cmx-tools/contracts'; const config: CmxConfig = { assets: { processors: { image: { version: '1', extensions: ['.svg'], process() { return { width: 40 }; } } } } }; export default config;`,
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
    },
  });
  await expect(
    pipeline.prepare({ entries: ["content.ts"], configPath: "cmx.config.ts" }),
  ).rejects.toThrow(/satisfies CmxConfig/);
});

test("concurrent builds share complete cached metadata without partial cache publication", async () => {
  const cwd = await project();
  await writeFile(path.join(cwd, "photo.svg"), "source");
  const assets = {
    processors: {
      image: {
        version: "1",
        extensions: [".svg"],
        async process() {
          await new Promise<void>((resolve) => setImmediate(resolve));
          return { src: "https://cdn.example.test/photo.svg", width: 40 };
        },
      },
    },
  };
  const build = () => createCmxAssetPipeline({ cwd, assets }).load("photo.svg");
  expect(await Promise.all([build(), build()])).toEqual([
    { src: "https://cdn.example.test/photo.svg", width: 40 },
    { src: "https://cdn.example.test/photo.svg", width: 40 },
  ]);
});

async function project() {
  const cwd = await mkdtemp(path.join(process.cwd(), ".cmx-assets-test-"));
  projects.push(cwd);
  return cwd;
}

import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CmxAssetStorage } from "@cmx-tools/contracts";
import { validateCmxAssetFile } from "./validateCmxAssetFile.js";

export type CreateLocalAssetStorageOptions = {
  directory: string;
  publicBaseUrl: string;
};

export function createLocalAssetStorage(
  options: CreateLocalAssetStorageOptions,
): CmxAssetStorage {
  return {
    async store(file) {
      validateCmxAssetFile(file);
      await mkdir(options.directory, { recursive: true });
      const filename = path.join(options.directory, file.key);
      const url = `${options.publicBaseUrl.replace(/\/$/, "")}/${file.key}`;
      const existing = await readFile(filename).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        },
      );
      if (existing) {
        if (!existing.equals(file.bytes))
          throw new Error(`Stored asset integrity mismatch: ${file.key}`);
        return url;
      }
      const temporary = path.join(
        options.directory,
        `.${file.key}-${randomUUID()}`,
      );
      try {
        await writeFile(temporary, file.bytes, { flag: "wx" });
        await link(temporary, filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const stored = await readFile(filename);
        if (!stored.equals(file.bytes))
          throw new Error(`Stored asset integrity mismatch: ${file.key}`);
      } finally {
        await rm(temporary, { force: true });
      }
      return url;
    },
  };
}

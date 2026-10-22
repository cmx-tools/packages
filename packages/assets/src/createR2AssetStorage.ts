import { createHash } from "node:crypto";
import { extname } from "node:path";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { CmxAssetStorage } from "@cmx-tools/contracts";
import { validateCmxAssetFile } from "./validateCmxAssetFile.js";

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/vnd.microsoft.icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".css": "text/css",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export type CreateR2AssetStorageOptions = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

export function createR2AssetStorage(
  options: CreateR2AssetStorageOptions,
): CmxAssetStorage {
  const client = new S3Client({
    region: "auto",
    endpoint: options.endpoint,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, "");
  return {
    async store(file) {
      validateCmxAssetFile(file);
      const url = `${publicBaseUrl}/${encodeURIComponent(file.key)}`;
      const checksum = createHash("md5").update(file.bytes).digest();
      const verifyStoredFile = async () => {
        const stored = await client.send(
          new HeadObjectCommand({ Bucket: options.bucket, Key: file.key }),
        );
        if (
          stored.ETag !== `"${checksum.toString("hex")}"` ||
          stored.ContentLength !== file.bytes.byteLength
        ) {
          throw new Error(`Asset integrity check failed for ${file.key}`);
        }
      };
      try {
        await verifyStoredFile();
        return url;
      } catch (error) {
        if (
          !(error instanceof S3ServiceException) ||
          error.$metadata.httpStatusCode !== 404
        ) {
          throw error;
        }
      }
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: options.bucket,
            Key: file.key,
            Body: file.bytes,
            ContentType:
              contentTypes[extname(file.key)] ?? "application/octet-stream",
            ContentMD5: checksum.toString("base64"),
            CacheControl: "public,max-age=31536000,immutable",
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        if (
          !(error instanceof S3ServiceException) ||
          error.$metadata.httpStatusCode !== 412
        ) {
          throw error;
        }
        await verifyStoredFile();
      }
      return url;
    },
  };
}

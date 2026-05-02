import { cmxBundle } from "./cmxBundle.js";

export async function cmxBundleExample(): Promise<void> {
  await cmxBundle({
    entries: {
      "404": "pages/404.tsx",
      about: "pages/about.tsx",
    },
    externals: ["@example/backend-contract", "@example/ui-library"],
    outDir: "dist",
  });
}

await cmxBundleExample();

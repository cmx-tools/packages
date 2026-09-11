import {
  type CmxUgcValuePath,
  type CmxUgcVerificationContext,
  reportCmxUgcDiagnostic,
} from "./CmxUgcVerificationContext.js";

const DISALLOWED_PROPS = new Set([
  "as",
  "aschild",
  "class",
  "classname",
  "contenteditable",
  "css",
  "dangerouslysetinnerhtml",
  "html",
  "id",
  "imagesrcset",
  "innerhtml",
  "is",
  "nonce",
  "ping",
  "srcdoc",
  "srcset",
  "style",
  "suppresscontenteditablewarning",
  "suppresshydrationwarning",
  "sx",
]);

const URL_PROPS = new Set([
  "action",
  "background",
  "cite",
  "formaction",
  "href",
  "poster",
  "src",
  "xlinkhref",
]);

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const RESOURCE_PROTOCOLS = new Set(["http:", "https:"]);

export function verifyCmxUgcProps(
  props: Record<string, unknown>,
  context: CmxUgcVerificationContext,
): void {
  for (const [name, value] of Object.entries(props)) {
    const propPath = ["props", name];
    const normalizedName = name.toLowerCase();
    if (
      normalizedName.startsWith("on") ||
      DISALLOWED_PROPS.has(normalizedName)
    ) {
      reportCmxUgcDiagnostic(
        context,
        "ugc-disallowed-prop",
        propPath,
        `Prop ${JSON.stringify(name)} is not allowed in UGC.`,
      );
    } else if (URL_PROPS.has(normalizedName)) {
      verifyUrlProp(normalizedName, value, propPath, context);
    }
  }
}

function verifyUrlProp(
  name: string,
  value: unknown,
  path: CmxUgcValuePath,
  context: CmxUgcVerificationContext,
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    reportCmxUgcDiagnostic(
      context,
      "ugc-unsafe-url",
      path,
      "UGC URL props must contain strings.",
    );
    return;
  }

  try {
    const url = new URL(value, "https://cmx.invalid");
    const allowedProtocols =
      name === "href" || name === "cite" ? LINK_PROTOCOLS : RESOURCE_PROTOCOLS;
    if (!allowedProtocols.has(url.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    reportCmxUgcDiagnostic(
      context,
      "ugc-unsafe-url",
      path,
      `URL ${JSON.stringify(value)} is not allowed in UGC.`,
    );
  }
}

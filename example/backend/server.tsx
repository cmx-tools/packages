import { createServer } from "node:http";
import { documentHost } from "./documentHost.js";
import { handlePublicationRequest } from "./handlePublicationRequest.js";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { environment } from "./_gen_cmx_environment.js";
import { cmx } from "@cmx-tools/react";

type AppProps = {
  title?: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
};

const port = Number(process.env.PORT) || 3000;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/_cmx/publication") {
      await handlePublicationRequest(req, res, url);
      return;
    }
    let route: string;
    try {
      route = decodeURIComponent(url.pathname.slice(1)) || "404";
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Invalid URL encoding");
      return;
    }
    const document = await documentHost.getDocument(route);
    if (document === undefined) {
      const fallback =
        route === "404" ? undefined : await documentHost.getDocument("404");
      const html =
        fallback === undefined
          ? renderHtml(<App>Not found</App>)
          : renderHtml(<App>{cmx(fallback, environment).default}</App>);
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const page = cmx(document, environment);
    const html = renderHtml(<App {...page.meta}>{page.default}</App>);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHtml(<App title="error">{errorMessage(error)}</App>));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});

function App({ title, accessory, children }: AppProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title ?? "example"}</title>
      </head>
      <body>
        {accessory}
        {children}
      </body>
    </html>
  );
}

function renderHtml(children: React.ReactNode): string {
  return `<!DOCTYPE html>${renderToString(<StrictMode>{children}</StrictMode>)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

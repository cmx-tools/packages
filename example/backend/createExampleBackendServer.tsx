import { createServer, type Server } from "node:http";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { environment } from "./_gen_cmx_environment.js";
import type { Meta } from "@example/backend-contract";
import { cmx } from "cmx-react";

type AppProps = {
  children: React.ReactNode;
  meta?: Meta;
};

export function createExampleBackendServer(): Server {
  return createServer(async (req, res) => {
    try {
      const route = req.url?.includes("/about") ? "about" : "404";
      const { default: document } = await import(`./_db_content/${route}.json`);
      const { children, meta } = cmx<Meta>(document, environment);
      const html = renderHtml(<App children={children} meta={meta} />);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderHtml(<App>{errorMessage(error)}</App>));
    }
  });
}

function App({ children, meta }: AppProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{meta?.title ?? "example"}</title>
      </head>
      <body>{children}</body>
    </html>
  );
}

function renderHtml(children: React.ReactNode): string {
  return `<!DOCTYPE html>${renderToString(<StrictMode>{children}</StrictMode>)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

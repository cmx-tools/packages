import { createServer } from "node:http";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { environment } from "./_gen_cmx_environment.js";
import type { Meta } from "@example/backend-contract";
import { renderCmxReact } from "cmx-react";

function App({ children, meta }: { children: React.ReactNode; meta?: Meta }) {
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

const server = createServer(async (req, res) => {
  const route = req.url?.includes("/about") ? "about" : "404";
  const { default: document } = await import(`./_db_content/${route}.json`);

  const { children, meta } = renderCmxReact(document, environment);
  const markup = renderToString(
    <StrictMode>
      <App children={children} meta={meta} />
    </StrictMode>,
  );
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>${markup}`);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`http://127.0.0.1:${port}`);
});

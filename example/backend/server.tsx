import { createServer } from "node:http";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { environment } from "./_gen_cmx_environment.js";
import { cmx } from "cmx-react";

type AppProps = {
  title: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
};

const port = Number(process.env.PORT) || 3000;

const server = createServer(async (req, res) => {
  try {
    const route = req.url?.includes("/about") ? "about" : "404";
    const { default: document } = await import(`./_db_content/${route}.json`);
    const page = cmx(document, environment);
    const title = toPageTitle(page);
    const accessory = toPageAccessory(page);
    const html = renderHtml(
      <App title={title} accessory={accessory}>
        {page.default}
      </App>,
    );

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHtml(<App>{errorMessage(error)}</App>));
  }
});

server.listen(port, () => {
  console.log(`http://127.0.0.1:${port}`);
});

function App({ title, accessory, children }: AppProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
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

function toPageTitle(page: unknown): string {
  if (
    typeof page === "object" &&
    page !== null &&
    "meta" in page &&
    typeof page.meta === "object" &&
    page.meta !== null &&
    "title" in page.meta &&
    typeof page.meta.title === "string"
  ) {
    return page.meta.title;
  }
  return "example";
}

function toPageAccessory(page: unknown): React.ReactNode | undefined {
  if (
    typeof page === "object" &&
    page !== null &&
    "meta" in page &&
    typeof page.meta === "object" &&
    page.meta !== null &&
    "accessory" in page.meta
  ) {
    return (page.meta as { accessory?: React.ReactNode }).accessory;
  }
  return undefined;
}

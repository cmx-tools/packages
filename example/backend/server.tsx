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
type Page = ReturnType<typeof cmx>;

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

function toPageTitle(page: Page): string {
  return page.meta?.title ?? "example";
}

function toPageAccessory(page: Page): React.ReactNode | undefined {
  return page.meta?.accessory;
}

import { createExampleBackendServer } from "./createExampleBackendServer.js";

const port = Number(process.env.PORT) || 3000;
const server = createExampleBackendServer();

server.listen(port, () => {
  console.log(`http://127.0.0.1:${port}`);
});

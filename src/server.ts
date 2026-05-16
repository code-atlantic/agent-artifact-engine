import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Agent Artifact Engine listening on http://${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error);
  console.error(error);
  process.exit(1);
}

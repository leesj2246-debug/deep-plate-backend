import app, { config, database } from "./index.js";

const server = app.listen(config.port, () => {
  console.log(`Deep Plate backend listening on http://localhost:${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down.`);
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

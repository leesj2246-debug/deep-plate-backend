import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";

export const config = loadConfig();
export const database = createDatabase(config.databaseUrl);
const app = createApp(database, config);

export default app;

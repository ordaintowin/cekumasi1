import app from "./app";
import { logger } from "./lib/logger";
import { closeDb } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// SSE connections stay open for hours — raise timeouts above typical proxy/LB defaults (60 s).
// Without this, most reverse proxies silently close idle connections after ~60 s,
// causing SSE clients to reconnect constantly and flood the server.
server.keepAliveTimeout = 65_000;   // 65 s — above nginx/HAProxy default of 60 s
server.headersTimeout   = 66_000;   // must be > keepAliveTimeout

async function shutdown() {
  server.close();
  try { await closeDb(); } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

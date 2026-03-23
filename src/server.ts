import http from 'http';
import { createApp } from './app';
import { env } from './utils/env';
import { connectMongo } from './utils/mongo';

async function main() {
  await connectMongo(env.MONGODB_URI);

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[api] fatal error', err);
  process.exit(1);
});

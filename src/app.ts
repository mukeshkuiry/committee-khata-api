import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { usersRouter } from './routes/users';
import { v1Router } from './routes/v1';
import { env } from './utils/env';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/', (_req, res) => res.json({ name: 'committee-api' }));
  app.use('/health', healthRouter);
  app.use('/users', usersRouter);

  // API contract base URL
  app.use('/api/v1', v1Router);

  app.use(errorHandler);

  return app;
}

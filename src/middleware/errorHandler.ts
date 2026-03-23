import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }

  if (err instanceof ZodError) {
    res
      .status(400)
      .json({ error: { message: err.issues[0]?.message ?? 'Invalid request', code: 'VALIDATION_ERROR' } });
    return;
  }

  res.status(500).json({ error: { message: 'Something went wrong', code: 'ERROR_CODE' } });
};

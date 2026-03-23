import { z } from 'zod';
import { HttpError } from './httpError';

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const res = schema.safeParse(body);
  if (!res.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', res.error.issues[0]?.message ?? 'Invalid request');
  }
  return res.data;
}

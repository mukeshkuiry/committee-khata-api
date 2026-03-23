import type { RequestHandler } from 'express';
import { HttpError } from '../utils/httpError';
import { verifyAdminToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminId?: string;
    }
  }
}

export const requireAdminAuth: RequestHandler = (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header) throw new HttpError(401, 'BAD_REQUEST', 'Missing Authorization header');

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'BAD_REQUEST', 'Invalid Authorization header');

    const payload = verifyAdminToken(token);
    if (!payload?.adminId) throw new HttpError(401, 'BAD_REQUEST', 'Invalid token');

    req.adminId = payload.adminId;
    next();
  } catch (err) {
    next(err);
  }
};

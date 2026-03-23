
import jwt from 'jsonwebtoken';
import { env } from './env';

export type AdminJwtPayload = {
  adminId: string;
};

export function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as AdminJwtPayload;
}

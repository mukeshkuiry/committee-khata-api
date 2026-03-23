import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdminAuth } from '../../middleware/auth';
import { AdminModel } from '../../models/Admin';
import { HttpError } from '../../utils/httpError';
import { signAdminToken } from '../../utils/jwt';
import { parseBody } from '../../utils/zod';

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = parseBody(
      z.object({
        name: z.string().min(1),
        phone: z.string().min(6).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6),
      }),
      req.body,
    );

    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const created = await AdminModel.create({
        name: body.name,
        phone: body.phone,
        email: body.email,
        passwordHash,
      });

      const token = signAdminToken({ adminId: String(created._id) });
      res.status(201).json({ adminId: created._id, token });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new HttpError(400, 'BAD_REQUEST', 'Email already registered');
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = parseBody(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }),
      req.body,
    );

    const admin = await AdminModel.findOne({ email: body.email });
    if (!admin) throw new HttpError(401, 'BAD_REQUEST', 'Invalid email or password');

    const ok = await bcrypt.compare(body.password, admin.passwordHash);
    if (!ok) throw new HttpError(401, 'BAD_REQUEST', 'Invalid email or password');

    const token = signAdminToken({ adminId: String(admin._id) });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
// Authorization: Bearer <token>
authRouter.get('/me', requireAdminAuth, async (req, res, next) => {
  try {
    const adminId = req.adminId;
    if (!adminId) throw new HttpError(401, 'BAD_REQUEST', 'Unauthorized');

    const admin = await AdminModel.findById(adminId).lean();
    if (!admin) throw new HttpError(401, 'BAD_REQUEST', 'Unauthorized');

    res.json({
      adminId: admin._id,
      name: admin.name,
      phone: admin.phone ?? null,
      email: admin.email ?? null,
      createdAt: admin.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { z } from 'zod';
import { UserModel } from '../models/User';

export const usersRouter = Router();

usersRouter.post('/', async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        passwordHash: z.string().min(10),
      })
      .parse(req.body);

    const created = await UserModel.create(body);
    res.status(201).json({ id: created._id, email: created.email });
  } catch (err) {
    next(err);
  }
});

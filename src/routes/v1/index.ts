import { Router } from 'express';
import { requireAdminAuth } from '../../middleware/auth';
import { authRouter } from './auth';
import { groupsRouter } from './groups';
import { loansRouter } from './loans';
import { membersRouter } from './members';
import { paymentsRouter } from './payments';

export const v1Router = Router();

v1Router.use('/auth', authRouter);

// everything below requires admin auth
v1Router.use(requireAdminAuth);

v1Router.use('/groups', groupsRouter);
v1Router.use('/members', membersRouter);
v1Router.use('/loans', loansRouter);
v1Router.use('/payments', paymentsRouter);

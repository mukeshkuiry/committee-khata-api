import { Router } from 'express';
import { z } from 'zod';
import { GroupModel } from '../../models/Group';
import { MemberModel } from '../../models/Member';
import { PaymentModel } from '../../models/Payment';
import { HttpError } from '../../utils/httpError';
import { applyPaymentPriority } from '../../utils/khata';
import { parseBody } from '../../utils/zod';

export const paymentsRouter = Router();

function requireAdminId(adminId: string | undefined): string {
  if (!adminId) throw new HttpError(401, 'BAD_REQUEST', 'Unauthorized');
  return adminId;
}

// POST /payments
paymentsRouter.post('/', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);

    const body = parseBody(
      z.object({
        memberId: z.string().regex(/^[0-9a-fA-F]{24}$/),
        amount: z.number().positive(),
      }),
      req.body,
    );

    const member = await MemberModel.findById(body.memberId);
    if (!member) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    const group = await GroupModel.findOne({ _id: member.groupId, adminId }).lean();
    if (!group) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    const totalDueRaw =
      (member.contributionDue ?? 0) + (member.fineBalance ?? 0) + (member.unpaidInterest ?? 0) + (member.principalRemaining ?? 0);
    const totalDue = Math.round((totalDueRaw + Number.EPSILON) * 100) / 100;

    if (body.amount > totalDue) {
      throw new HttpError(400, 'BAD_REQUEST', `Amount cannot be more than due (₹${totalDue})`);
    }

    const { breakdown, updated } = applyPaymentPriority({
      amount: body.amount,
      member,
    });

    member.fineBalance = updated.fineBalance;
    member.unpaidInterest = updated.unpaidInterest;
    member.principalRemaining = updated.principalRemaining;
    member.contributionDue = updated.contributionDue;
    member.contributionPaid += updated.contributionPaidDelta;
    await member.save();

    const payment = await PaymentModel.create({
      memberId: member._id,
      groupId: member.groupId,
      amount: Math.round((body.amount + Number.EPSILON) * 100) / 100,
      breakdown,
      remaining: {
        principal: member.principalRemaining,
        interest: member.unpaidInterest,
        fine: member.fineBalance,
      },
      month: group.currentMonth,
    });

    res.status(201).json({
      paymentId: payment._id,
      breakdown: payment.breakdown,
      remaining: payment.remaining,
      createdAt: payment.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

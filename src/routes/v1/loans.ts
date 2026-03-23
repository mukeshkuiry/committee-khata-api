import { Router } from 'express';
import { z } from 'zod';
import { GroupModel } from '../../models/Group';
import { LoanModel } from '../../models/Loan';
import { MemberModel } from '../../models/Member';
import { PaymentModel } from '../../models/Payment';
import { HttpError } from '../../utils/httpError';
import { parseBody } from '../../utils/zod';

export const loansRouter = Router();

function requireAdminId(adminId: string | undefined): string {
  if (!adminId) throw new HttpError(401, 'BAD_REQUEST', 'Unauthorized');
  return adminId;
}

// POST /loans
loansRouter.post('/', async (req, res, next) => {
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

    // Available balance = total inbound payments to the group - total principal outstanding.
    // Loan cannot exceed the available balance.
    const [paymentsAgg, members] = await Promise.all([
      PaymentModel.aggregate([
        { $match: { groupId: member.groupId } },
        { $group: { _id: null, totalPaidIn: { $sum: '$amount' } } },
      ]),
      MemberModel.find({ groupId: member.groupId }).select({ principalRemaining: 1 }).lean(),
    ]);

    const totalPaidIn = paymentsAgg?.[0]?.totalPaidIn ?? 0;
    const totalPrincipalOutstanding = members.reduce((sum, m) => sum + (m.principalRemaining ?? 0), 0);
    const availableGroupBalance = Math.max(0, totalPaidIn - totalPrincipalOutstanding);

    if (body.amount > availableGroupBalance) {
      throw new HttpError(
        400,
        'INSUFFICIENT_GROUP_BALANCE',
        `Insufficient group balance. Available to lend: ${availableGroupBalance}`,
      );
    }

    member.principalRemaining += body.amount;
    member.loanIssuedAtMonth = group.currentMonth;
    await member.save();

    const loan = await LoanModel.create({
      adminId,
      groupId: group._id,
      memberId: member._id,
      amount: body.amount,
      month: group.currentMonth,
    });

    res.status(201).json({
      loanId: loan._id,
      principalRemaining: member.principalRemaining,
      unpaidInterest: member.unpaidInterest,
      createdAt: loan.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

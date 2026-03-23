import { Router } from 'express';
import { z } from 'zod';
import { GroupModel } from '../../models/Group';
import { LoanModel } from '../../models/Loan';
import { MemberModel } from '../../models/Member';
import { PaymentModel } from '../../models/Payment';
import { HttpError } from '../../utils/httpError';
import { parseBody } from '../../utils/zod';

export const membersRouter = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

function requireAdminId(adminId: string | undefined): string {
  if (!adminId) throw new HttpError(401, 'BAD_REQUEST', 'Unauthorized');
  return adminId;
}

async function assertMemberOwnedByAdmin(memberId: string, adminId: string) {
  const member = await MemberModel.findById(memberId).lean();
  if (!member) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');

  const group = await GroupModel.findOne({ _id: member.groupId, adminId }).lean();
  if (!group) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');

  return { member, group };
}

// DELETE /members/:memberId
membersRouter.delete('/:memberId', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { memberId } = parseBody(z.object({ memberId: objectId }), req.params);

    await assertMemberOwnedByAdmin(memberId, adminId);

    const deleted = await MemberModel.findByIdAndDelete(memberId);
    if (!deleted) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    await PaymentModel.deleteMany({ memberId: deleted._id });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /members/:memberId
membersRouter.get('/:memberId', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { memberId } = parseBody(z.object({ memberId: objectId }), req.params);

    const { member } = await assertMemberOwnedByAdmin(memberId, adminId);

    res.json({
      name: member.name,
      createdAt: member.createdAt,
      loan: {
        principalRemaining: member.principalRemaining,
        unpaidInterest: member.unpaidInterest,
        loanIssuedAtMonth: member.loanIssuedAtMonth,
      },
      fine: member.fineBalance,
      contribution: {
        totalDue: member.contributionDue,
        paid: member.contributionPaid,
      },
      history: [],
    });
  } catch (err) {
    next(err);
  }
});

// GET /members/:memberId/loan
membersRouter.get('/:memberId/loan', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { memberId } = parseBody(z.object({ memberId: objectId }), req.params);

    const { member } = await assertMemberOwnedByAdmin(memberId, adminId);

    res.json({
      principalRemaining: member.principalRemaining,
      unpaidInterest: member.unpaidInterest,
      unpaidInterestMonths: member.unpaidInterestMonths,
    });
  } catch (err) {
    next(err);
  }
});

// GET /members/:memberId/payments
membersRouter.get('/:memberId/payments', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { memberId } = parseBody(z.object({ memberId: objectId }), req.params);

    await assertMemberOwnedByAdmin(memberId, adminId);

    const payments = await PaymentModel.find({ memberId }).sort({ createdAt: -1 }).lean();

    res.json(
      payments.map((p) => ({
        id: p._id,
        amount: p.amount,
        breakdown: p.breakdown,
        remaining: p.remaining,
        month: p.month,
        createdAt: p.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// GET /members/:memberId/loans
membersRouter.get('/:memberId/loans', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { memberId } = parseBody(z.object({ memberId: objectId }), req.params);

    const { member } = await assertMemberOwnedByAdmin(memberId, adminId);

    const loans = await LoanModel.find({ memberId: member._id, adminId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(
      loans.map((l) => ({
        id: l._id,
        amount: l.amount,
        month: l.month,
        createdAt: l.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// (helper) resolve member's group (for other routes)
export async function getMemberGroupId(memberId: string) {
  const member = await MemberModel.findById(memberId).lean();
  if (!member) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');

  const group = await GroupModel.findById(member.groupId).lean();
  if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

  return { member, group };
}

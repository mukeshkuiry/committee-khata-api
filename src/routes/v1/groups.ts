import { Router } from 'express';
import { z } from 'zod';
import { GroupModel } from '../../models/Group';
import { MemberModel } from '../../models/Member';
import { MonthEntryModel } from '../../models/MonthEntry';
import { PaymentModel } from '../../models/Payment';
import { HttpError } from '../../utils/httpError';
import { applySixMonthRule, monthlyInterest } from '../../utils/khata';
import { parseBody } from '../../utils/zod';

export const groupsRouter = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

function requireAdminId(adminId: string | undefined): string {
  if (!adminId) throw new HttpError(401, 'BAD_REQUEST', 'Unauthorized');
  return adminId;
}

groupsRouter.post('/', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);

    const body = parseBody(
      z.object({
        name: z.string().min(1),
        monthlyContribution: z.number().nonnegative(),
        interestRate: z.number().nonnegative(),
        fineAmount: z.number().nonnegative(),
        totalMonths: z.number().int().positive(),
      }),
      req.body,
    );

    // Start with no months created yet.
    const created = await GroupModel.create({ ...body, adminId, currentMonth: 0 });
    res.status(201).json({ id: created._id, name: created.name });
  } catch (err) {
    next(err);
  }
});

groupsRouter.get('/', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const groups = await GroupModel.find({ adminId }).sort({ createdAt: -1 }).lean();

    const groupIds = groups.map((g) => g._id);

    const [membersAgg, paymentsAgg] = await Promise.all([
      MemberModel.aggregate([
        { $match: { groupId: { $in: groupIds } } },
        {
          $group: {
            _id: '$groupId',
            totalDue: {
              $sum: {
                $add: ['$contributionDue', '$fineBalance', '$unpaidInterest', '$principalRemaining'],
              },
            },
            principalOutstanding: { $sum: '$principalRemaining' },
          },
        },
      ]),
      PaymentModel.aggregate([
        { $match: { groupId: { $in: groupIds } } },
        { $group: { _id: '$groupId', totalPaidIn: { $sum: '$amount' } } },
      ]),
    ]);

    const byGroupId: Record<string, { totalDue: number; principalOutstanding: number; totalPaidIn: number }> = {};

    for (const m of membersAgg) {
      byGroupId[String(m._id)] = {
        totalDue: m.totalDue ?? 0,
        principalOutstanding: m.principalOutstanding ?? 0,
        totalPaidIn: 0,
      };
    }

    for (const p of paymentsAgg) {
      const key = String(p._id);
      if (!byGroupId[key]) {
        byGroupId[key] = { totalDue: 0, principalOutstanding: 0, totalPaidIn: p.totalPaidIn ?? 0 };
      } else {
        byGroupId[key].totalPaidIn = p.totalPaidIn ?? 0;
      }
    }

    res.json(
      groups.map((g) => {
        const s = byGroupId[String(g._id)] ?? { totalDue: 0, principalOutstanding: 0, totalPaidIn: 0 };
        const availableGroupBalance = Math.max(0, (s.totalPaidIn ?? 0) - (s.principalOutstanding ?? 0));

        // Next contribution date:
        // Next contribution is always the next scheduled contribution month.
        // If currentMonth=0 (no month created yet), next is +1 month after creation.
        // If currentMonth=n, next is +(n+1) months after creation.
        const base = new Date(g.createdAt);
        const next = new Date(base);
        const cm = g.currentMonth ?? 0;
        const offsetMonths = cm;
        next.setMonth(base.getMonth() + offsetMonths);

        return {
          id: g._id,
          name: g.name,
          currentMonth: g.currentMonth,
          totalMonths: g.totalMonths,
          availableGroupBalance,
          totalDue: s.totalDue ?? 0,
          createdAt: g.createdAt,
          nextContributionDate: next.toISOString(),
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

groupsRouter.get('/:groupId', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);

    const group = await GroupModel.findOne({ _id: groupId, adminId }).lean();
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    res.json({
      id: group._id,
      name: group.name,
      monthlyContribution: group.monthlyContribution,
      interestRate: group.interestRate,
      fineAmount: group.fineAmount,
      totalMonths: group.totalMonths,
      currentMonth: group.currentMonth,
      createdAt: group.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /groups/:groupId
groupsRouter.delete('/:groupId', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);

    const group = await GroupModel.findOneAndDelete({ _id: groupId, adminId });
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const members = await MemberModel.find({ groupId: group._id }).select({ _id: 1 }).lean();
    const memberIds = members.map((m) => m._id);

    await Promise.all([
      MemberModel.deleteMany({ groupId: group._id }),
      MonthEntryModel.deleteMany({ groupId: group._id }),
      PaymentModel.deleteMany({ groupId: group._id }),
      ...(memberIds.length ? [PaymentModel.deleteMany({ memberId: { $in: memberIds } })] : []),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /groups/:groupId/members
// Body: { name }
groupsRouter.post('/:groupId/members', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);
    const body = parseBody(z.object({ name: z.string().min(1) }), req.body);

    const group = await GroupModel.findOne({ _id: groupId, adminId }).lean();
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    if (group.currentMonth > 0) {
      throw new HttpError(400, 'MEMBERS_LOCKED', 'Members can only be added before month 1 starts');
    }

    const nameKey = body.name.trim().toLowerCase();

    const existing = await MemberModel.findOne({ groupId: group._id, nameKey }).select({ _id: 1 }).lean();
    if (existing) {
      throw new HttpError(400, 'DUPLICATE_MEMBER_NAME', 'Member name already exists in this group');
    }

    try {
      const created = await MemberModel.create({
        groupId: group._id,
        name: body.name,
        nameKey,
        contributionDue: 0,
        contributionPaid: 0,
        fineBalance: 0,
        principalRemaining: 0,
        unpaidInterest: 0,
        unpaidInterestMonths: 0,
        loanIssuedAtMonth: 0,
      });

      res.status(201).json({ id: created._id, name: created.name });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new HttpError(400, 'DUPLICATE_MEMBER_NAME', 'Member name already exists in this group');
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// GET /groups/:groupId/members
groupsRouter.get('/:groupId/members', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);

    const group = await GroupModel.findOne({ _id: groupId, adminId }).lean();
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const members = await MemberModel.find({ groupId }).sort({ createdAt: 1 }).lean();
    res.json(
      members.map((m) => ({
        id: m._id,
        name: m.name,
        contributionDue: m.contributionDue,
        contributionPaid: m.contributionPaid,
        fine: m.fineBalance,
        loan: {
          principalRemaining: m.principalRemaining,
          unpaidInterest: m.unpaidInterest,
          unpaidInterestMonths: m.unpaidInterestMonths,
        },
      })),
    );
  } catch (err) {
    next(err);
  }
});

// POST /groups/:groupId/months
// Body optional: { month }
groupsRouter.post('/:groupId/months', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);
    const body = parseBody(z.object({ month: z.number().int().positive().optional() }), req.body ?? {});

    const group = await GroupModel.findOne({ _id: groupId, adminId });
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    // Only allow creating next month within a time window around the scheduled contribution date.
    // - If currentMonth=0 (month 1 not created yet): allow from group creation date up to +2 days.
    // - Otherwise: allow within ±2 days of createdAt + (currentMonth + 1) months.
    const now = new Date();
    const base = new Date(group.createdAt);

    const isFirstMonth = (group.currentMonth ?? 0) === 0;

    const nextContributionDate = new Date(base);
    const offsetMonths = isFirstMonth ? 0 : (group.currentMonth ?? 0) + 1;
    nextContributionDate.setMonth(base.getMonth() + offsetMonths);

    let start = new Date(nextContributionDate);
    let end = new Date(nextContributionDate);

    if (isFirstMonth) {
      start = new Date(base);
      start.setHours(0, 0, 0, 0);

      end = new Date(base);
      end.setDate(end.getDate() + 2);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(start.getDate() - 2);
      start.setHours(0, 0, 0, 0);

      end.setDate(end.getDate() + 2);
      end.setHours(23, 59, 59, 999);
    }

    if (now < start || now > end) {
      throw new HttpError(
        400,
        'NEXT_MONTH_NOT_ALLOWED_TODAY',
        isFirstMonth
          ? `First month can only be created within 2 days of group creation (${base.toISOString()}). Allowed window: ${start.toISOString()} to ${end.toISOString()}.`
          : `Next month can only be created within ±2 days of the contribution date (${nextContributionDate.toISOString()}). Allowed window: ${start.toISOString()} to ${end.toISOString()}.`,
      );
    }

    const last = group.currentMonth;
    const nextMonth = body.month ?? last + 1;
    if (nextMonth !== last + 1) throw new HttpError(400, 'BAD_REQUEST', 'Month must be lastMonth + 1');
    if (nextMonth > group.totalMonths) throw new HttpError(400, 'BAD_REQUEST', 'Month exceeds totalMonths');

    const memberCount = await MemberModel.countDocuments({ groupId: group._id });
    if (memberCount === 0) {
      throw new HttpError(400, 'NO_MEMBERS_IN_GROUP', 'Add at least one member before creating the next month.');
    }

    // Ensure unique month entry
    await MonthEntryModel.create({ groupId: group._id, month: nextMonth });

    const members = await MemberModel.find({ groupId: group._id });
    for (const member of members) {
      // Fine rule (iterative): for EVERY month that a member has any unpaid contribution,
      // add fineAmount again.
      // Example: Month1 unpaid until Month4 => fine is added in Month2, Month3, Month4 => 3 * fineAmount.
      if (member.contributionDue > 0) {
        member.fineBalance += group.fineAmount;
      }

      // 1) Add this month's contribution due
      member.contributionDue += group.monthlyContribution;

      // 2) Add interest to loan
      if (member.principalRemaining > 0) {
        const interest = monthlyInterest(member.principalRemaining, group.interestRate);
        member.unpaidInterest += interest;
        member.unpaidInterest = Math.round((member.unpaidInterest + Number.EPSILON) * 100) / 100;
        member.unpaidInterestMonths += 1;
      }

      // 3) Apply 6-month rule
      const six = applySixMonthRule(member);
      member.principalRemaining = six.principalRemaining;
      member.unpaidInterest = six.unpaidInterest;
      member.unpaidInterestMonths = six.unpaidInterestMonths;

      await member.save();
    }

    group.currentMonth = nextMonth;
    await group.save();

    res.status(201).json({ month: nextMonth, status: 'created' });
  } catch (err: any) {
    // Duplicate month index
    if (err?.code === 11000) {
      next(new HttpError(400, 'BAD_REQUEST', 'Month already exists'));
      return;
    }
    next(err);
  }
});

// GET /groups/:groupId/dashboard
groupsRouter.get('/:groupId/dashboard', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);

    const group = await GroupModel.findOne({ _id: groupId, adminId }).lean();
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const members = await MemberModel.find({ groupId }).sort({ createdAt: 1 }).lean();

    // Available balance = total inbound payments to the group (all categories)
    // minus total principal currently outstanding (cash already given out as loans).
    const paymentsAgg = await PaymentModel.aggregate([
      { $match: { groupId: group._id } },
      { $group: { _id: null, totalPaidIn: { $sum: '$amount' } } },
    ]);
    const totalPaidIn = paymentsAgg?.[0]?.totalPaidIn ?? 0;

    const totalPrincipalOutstanding = members.reduce((sum, m) => sum + (m.principalRemaining ?? 0), 0);
    const availableGroupBalance = Math.max(0, totalPaidIn - totalPrincipalOutstanding);

    res.json({
      availableGroupBalance: Math.round((availableGroupBalance + Number.EPSILON) * 100) / 100,
      rows: members.map((m) => {
        const totalDue = m.contributionDue + m.fineBalance + m.unpaidInterest + m.principalRemaining;
        return {
          memberId: m._id,
          name: m.name,
          contributionDue: Math.round((m.contributionDue + Number.EPSILON) * 100) / 100,
          contributionPaid: Math.round((m.contributionPaid + Number.EPSILON) * 100) / 100,
          fine: Math.round((m.fineBalance + Number.EPSILON) * 100) / 100,
          loan: {
            principal: Math.round((m.principalRemaining + Number.EPSILON) * 100) / 100,
            interest: Math.round((m.unpaidInterest + Number.EPSILON) * 100) / 100,
          },
          totalDue: Math.round((totalDue + Number.EPSILON) * 100) / 100,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// GET /groups/:groupId/summary
// Only available when the committee is completed (currentMonth === totalMonths) AND all dues are cleared.
groupsRouter.get('/:groupId/summary', async (req, res, next) => {
  try {
    const adminId = requireAdminId(req.adminId);
    const { groupId } = parseBody(z.object({ groupId: objectId }), req.params);

    const group = await GroupModel.findOne({ _id: groupId, adminId }).lean();
    if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const members = await MemberModel.find({ groupId: group._id }).sort({ createdAt: 1 }).lean();

    const isCompleted = group.currentMonth === group.totalMonths;
    if (!isCompleted) {
      throw new HttpError(400, 'GROUP_NOT_COMPLETED', 'Group is not completed yet');
    }

    const membersWithDue = members
      .map((m) => ({
        id: String(m._id),
        name: m.name,
        due: (m.contributionDue ?? 0) + (m.fineBalance ?? 0) + (m.unpaidInterest ?? 0) + (m.principalRemaining ?? 0),
      }))
      .filter((m) => m.due > 0);

    if (membersWithDue.length) {
      throw new HttpError(400, 'GROUP_HAS_DUES', 'All member dues must be cleared to view summary');
    }

    const paymentsAgg = await PaymentModel.aggregate([
      { $match: { groupId: group._id } },
      {
        $group: {
          _id: null,
          totalPaidIn: { $sum: '$amount' },
          totalContributionPaid: { $sum: '$breakdown.contribution' },
          totalFinePaid: { $sum: '$breakdown.fine' },
          totalInterestPaid: { $sum: '$breakdown.interest' },
          totalPrincipalPaid: { $sum: '$breakdown.principal' },
        },
      },
    ]);

    const totals = paymentsAgg?.[0] ?? {
      totalPaidIn: 0,
      totalContributionPaid: 0,
      totalFinePaid: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
    };

    const totalMembers = members.length;
    const totalMonths = group.totalMonths;

    const totalExpectedContribution = totalMembers * totalMonths * group.monthlyContribution;

    // If group is completed and all dues are clear, there should be no outstanding principal.
    // The remaining cash in the group equals total inbound payments.
    const cashPool = totals.totalPaidIn;
    const perMemberPayout = totalMembers > 0 ? cashPool / totalMembers : 0;

    // “Profit” here means amount above that member's own contributions.
    // Note: This is a simplified view (it doesn't try to “net out” principals by member); it matches real cash flow at end.
    const perMemberProfit = perMemberPayout - totalMonths * group.monthlyContribution;

    res.json({
      group: {
        id: group._id,
        name: group.name,
        monthlyContribution: group.monthlyContribution,
        totalMonths: group.totalMonths,
        currentMonth: group.currentMonth,
      },
      totals: {
        totalMembers,
        totalExpectedContribution,
        totalPaidIn: totals.totalPaidIn,
        totalContributionPaid: totals.totalContributionPaid,
        totalFinePaid: totals.totalFinePaid,
        totalInterestPaid: totals.totalInterestPaid,
        totalPrincipalPaid: totals.totalPrincipalPaid,
        cashPool,
        perMemberPayout,
        perMemberProfit,
      },
      members: members.map((m) => {
        const contributed = m.contributionPaid ?? 0;
        const profit = perMemberPayout - contributed;
        return {
          memberId: m._id,
          name: m.name,
          contributed,
          payout: perMemberPayout,
          profit,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

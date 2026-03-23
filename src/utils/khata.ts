import type { Member } from '../models/Member';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PaymentBreakdown = {
  fine: number;
  interest: number;
  principal: number;
  contribution: number;
};

export function applyPaymentPriority(args: {
  amount: number;
  member: Pick<
    Member,
    'fineBalance' | 'unpaidInterest' | 'principalRemaining' | 'contributionDue'
  >;
}): {
  breakdown: PaymentBreakdown;
  updated: {
    fineBalance: number;
    unpaidInterest: number;
    principalRemaining: number;
    contributionDue: number;
    contributionPaidDelta: number;
  };
} {
  let remaining = args.amount;

  // Priority: Fine -> Contribution -> Interest -> Principal
  const payFine = Math.min(remaining, args.member.fineBalance);
  remaining -= payFine;

  const payContribution = Math.min(remaining, args.member.contributionDue);
  remaining -= payContribution;

  const payInterest = Math.min(remaining, args.member.unpaidInterest);
  remaining -= payInterest;

  const payPrincipal = Math.min(remaining, args.member.principalRemaining);
  remaining -= payPrincipal;

  return {
    breakdown: {
      fine: round2(payFine),
      interest: round2(payInterest),
      principal: round2(payPrincipal),
      contribution: round2(payContribution),
    },
    updated: {
      fineBalance: round2(args.member.fineBalance - payFine),
      unpaidInterest: round2(args.member.unpaidInterest - payInterest),
      principalRemaining: round2(args.member.principalRemaining - payPrincipal),
      contributionDue: round2(args.member.contributionDue - payContribution),
      contributionPaidDelta: round2(payContribution),
    },
  };
}

export function monthlyInterest(principalRemaining: number, interestRate: number): number {
  return round2((principalRemaining * interestRate) / 100);
}

export function applySixMonthRule(member: Pick<Member, 'principalRemaining' | 'unpaidInterest' | 'unpaidInterestMonths'>): {
  principalRemaining: number;
  unpaidInterest: number;
  unpaidInterestMonths: number;
  applied: boolean;
} {
  if (member.unpaidInterestMonths > 6 && member.unpaidInterest > 0) {
    return {
      principalRemaining: member.principalRemaining + member.unpaidInterest,
      unpaidInterest: 0,
      unpaidInterestMonths: 0,
      applied: true,
    };
  }
  return {
    principalRemaining: member.principalRemaining,
    unpaidInterest: member.unpaidInterest,
    unpaidInterestMonths: member.unpaidInterestMonths,
    applied: false,
  };
}

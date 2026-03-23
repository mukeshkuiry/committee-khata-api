import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const memberSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, trim: true, lowercase: true },

    // Contribution ledger
    contributionDue: { type: Number, required: true, min: 0, default: 0 },
    contributionPaid: { type: Number, required: true, min: 0, default: 0 },

    // Fine balance
    fineBalance: { type: Number, required: true, min: 0, default: 0 },

    // Loan ledger
    principalRemaining: { type: Number, required: true, min: 0, default: 0 },
    unpaidInterest: { type: Number, required: true, min: 0, default: 0 },
    unpaidInterestMonths: { type: Number, required: true, min: 0, default: 0 },
    loanIssuedAtMonth: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

memberSchema.index({ groupId: 1, nameKey: 1 }, { unique: true });

export type Member = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };

export const MemberModel = model('Member', memberSchema);

import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const loanSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },

    amount: { type: Number, required: true, min: 0 },
    month: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

loanSchema.index({ adminId: 1, groupId: 1, createdAt: -1 });
loanSchema.index({ memberId: 1, createdAt: -1 });

export type Loan = InferSchemaType<typeof loanSchema> & { _id: Types.ObjectId };

export const LoanModel = model('Loan', loanSchema);

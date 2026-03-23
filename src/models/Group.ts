import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const groupSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    name: { type: String, required: true, trim: true },
    monthlyContribution: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, required: true, min: 0 }, // percent per month
    fineAmount: { type: Number, required: true, min: 0 },
    totalMonths: { type: Number, required: true, min: 1 },
    currentMonth: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

groupSchema.index({ adminId: 1, createdAt: -1 });

export type Group = InferSchemaType<typeof groupSchema> & { _id: Types.ObjectId };

export const GroupModel = model('Group', groupSchema);

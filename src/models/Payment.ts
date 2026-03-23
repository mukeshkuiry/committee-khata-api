import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const paymentSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },

    breakdown: {
      fine: { type: Number, required: true, min: 0 },
      interest: { type: Number, required: true, min: 0 },
      principal: { type: Number, required: true, min: 0 },
      contribution: { type: Number, required: true, min: 0 },
    },

    remaining: {
      principal: { type: Number, required: true, min: 0 },
      interest: { type: Number, required: true, min: 0 },
      fine: { type: Number, required: true, min: 0 },
    },

    month: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export type Payment = InferSchemaType<typeof paymentSchema> & { _id: Types.ObjectId };

export const PaymentModel = model('Payment', paymentSchema);

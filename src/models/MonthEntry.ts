import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const monthEntrySchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    month: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

monthEntrySchema.index({ groupId: 1, month: 1 }, { unique: true });

export type MonthEntry = InferSchemaType<typeof monthEntrySchema> & { _id: Types.ObjectId };

export const MonthEntryModel = model('MonthEntry', monthEntrySchema);

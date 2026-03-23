import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: false, trim: true },
    email: { type: String, required: false, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

adminSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  },
);

export type Admin = InferSchemaType<typeof adminSchema> & { _id: Types.ObjectId };

export const AdminModel = model('Admin', adminSchema);

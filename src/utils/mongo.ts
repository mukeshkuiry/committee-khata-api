import mongoose from 'mongoose';

export async function connectMongo(uri: string) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);

  // Ensure declared indexes (including unique constraints) exist in MongoDB.
  // Without this, new indexes may not be created until a manual sync.
  await mongoose.syncIndexes();
}

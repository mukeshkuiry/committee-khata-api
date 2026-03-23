import 'dotenv/config';

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  MONGODB_URI: required('MONGODB_URI', process.env.MONGODB_URI),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  JWT_SECRET: required('JWT_SECRET', process.env.JWT_SECRET),
};

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;

const queryClient = postgres(connectionString, {
  max: 10,
  prepare: false,   // 👈 safe to keep even on session mode; required if you ever use 6543 again
});

export const db = drizzle(queryClient, { schema });
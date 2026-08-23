import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js'; // 👈 MUST IMPORT ALL SCHEMA TABLES
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL!;

// Set up connection pool with postgres.js
const queryClient = postgres(connectionString, { max: 10 });

export const db = drizzle(queryClient, { schema });
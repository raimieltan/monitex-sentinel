import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../config/env.js";

// Single shared Prisma client for the whole process (API routes + worker).
// Prisma 7's generated client requires an explicit driver adapter.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

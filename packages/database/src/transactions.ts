import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client";

export type TransactionClient = Prisma.TransactionClient;

export function withTransaction<T>(
  action: (tx: TransactionClient) => Promise<T>,
  client: PrismaClient = prisma
) {
  return client.$transaction(action);
}

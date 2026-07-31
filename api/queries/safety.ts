import { and, desc, eq, or } from "drizzle-orm";
import {
  blocks,
  profiles,
  reports,
  type Block,
  type Profile,
} from "@db/schema";
import { getDb } from "./connection";

export async function createReport(data: {
  reporterId: number;
  targetUserId: number;
  reason: string;
  detail?: string;
}): Promise<void> {
  await getDb().insert(reports).values(data);
}

export async function blockUser(
  blockerId: number,
  blockedId: number,
): Promise<void> {
  await getDb()
    .insert(blocks)
    .values({ blockerId, blockedId })
    .onDuplicateKeyUpdate({ set: { blockedId } });
}

export async function unblockUser(
  blockerId: number,
  blockedId: number,
): Promise<void> {
  await getDb()
    .delete(blocks)
    .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
}

export async function listBlocked(
  blockerId: number,
): Promise<(Block & { profile: Profile | null })[]> {
  const rows = await getDb()
    .select({ block: blocks, profile: profiles })
    .from(blocks)
    .leftJoin(profiles, eq(blocks.blockedId, profiles.userId))
    .where(eq(blocks.blockerId, blockerId))
    .orderBy(desc(blocks.createdAt));
  return rows.map((r) => ({ ...r.block, profile: r.profile }));
}

/** A block exists in either direction between two users. */
export async function isBlockedBetween(
  userA: number,
  userB: number,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, userA), eq(blocks.blockedId, userB)),
        and(eq(blocks.blockerId, userB), eq(blocks.blockedId, userA)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

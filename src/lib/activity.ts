import type { Connection, PublicKey } from "@solana/web3.js";

export type ActivityRow = { signature: string; slot: number; err: unknown };

export async function fetchRecentActivity(
  connection: Connection,
  address: PublicKey,
  limit = 20
): Promise<ActivityRow[]> {
  const sigs = await connection.getSignaturesForAddress(address, { limit });
  return sigs.map((s) => ({
    signature: s.signature,
    slot: s.slot,
    err: s.err,
  }));
}

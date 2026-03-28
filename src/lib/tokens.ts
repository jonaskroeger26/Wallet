import type { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export type ParsedTokenRow = {
  mint: string;
  amountUi: string;
  decimals: number;
  program: "spl-token" | "token-2022";
  rawAmount: bigint;
};

let jupiterTokenCache: Map<string, { symbol: string; name: string; decimals: number }> | null = null;

export async function loadJupiterTokenMap(): Promise<
  Map<string, { symbol: string; name: string; decimals: number }>
> {
  if (jupiterTokenCache) return jupiterTokenCache;
  const res = await fetch("https://token.jup.ag/strict");
  if (!res.ok) throw new Error("Could not load Jupiter token list.");
  const list = (await res.json()) as Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  }>;
  const m = new Map<string, { symbol: string; name: string; decimals: number }>();
  for (const t of list) {
    m.set(t.address, { symbol: t.symbol, name: t.name, decimals: t.decimals });
  }
  jupiterTokenCache = m;
  return m;
}

export async function fetchSplTokenRows(
  connection: Connection,
  owner: PublicKey
): Promise<ParsedTokenRow[]> {
  const [a, b] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const rows: ParsedTokenRow[] = [];
  for (const { pubkey, account } of [...a.value, ...b.value]) {
    void pubkey;
    const parsed = account.data as {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { amount: string; decimals: number; uiAmountString?: string };
        };
      };
    };
    const info = parsed.parsed?.info;
    const mint = info?.mint;
    const ta = info?.tokenAmount;
    if (!mint || !ta) continue;
    const raw = BigInt(ta.amount);
    if (raw === 0n) continue;
    const program =
      account.owner.equals(TOKEN_2022_PROGRAM_ID) ? "token-2022" : "spl-token";
    rows.push({
      mint,
      decimals: ta.decimals,
      amountUi: ta.uiAmountString ?? formatUi(raw, ta.decimals),
      rawAmount: raw,
      program,
    });
  }
  return rows.sort((x, y) => x.mint.localeCompare(y.mint));
}

function formatUi(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (decimals === 0) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
}

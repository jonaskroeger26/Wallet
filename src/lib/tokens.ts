import type { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { NATIVE_MINT_STR, USDC_MINT_MAINNET } from "./jupiter";

export type ParsedTokenRow = {
  mint: string;
  amountUi: string;
  decimals: number;
  program: "spl-token" | "token-2022";
  rawAmount: bigint;
};

let jupiterTokenCache: Map<string, { symbol: string; name: string; decimals: number }> | null = null;
const TOKEN_LIST_OVERRIDE = import.meta.env.VITE_TOKEN_LIST_URL?.trim();
const TOKEN_LIST_URLS = [
  ...(TOKEN_LIST_OVERRIDE ? [TOKEN_LIST_OVERRIDE] : []),
  "https://cache.jup.ag/tokens",
  "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json",
  "https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json",
];

type TokenLike = {
  address?: string;
  mint?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
};

function parseTokenListJson(input: unknown): TokenLike[] {
  if (Array.isArray(input)) return input as TokenLike[];
  if (!input || typeof input !== "object") return [];
  const obj = input as { tokens?: unknown };
  if (Array.isArray(obj.tokens)) return obj.tokens as TokenLike[];
  return [];
}

function tokenMapFromList(list: TokenLike[]): Map<string, { symbol: string; name: string; decimals: number }> {
  const m = new Map<string, { symbol: string; name: string; decimals: number }>();
  for (const t of list) {
    const address = typeof t.address === "string" ? t.address : typeof t.mint === "string" ? t.mint : "";
    const symbol = typeof t.symbol === "string" ? t.symbol : "";
    const name = typeof t.name === "string" ? t.name : "";
    const decimals = typeof t.decimals === "number" ? t.decimals : NaN;
    if (!address || !symbol || !name || !Number.isFinite(decimals)) continue;
    m.set(address, { symbol, name, decimals });
  }
  return m;
}

function minimalFallbackTokenMap(): Map<string, { symbol: string; name: string; decimals: number }> {
  const m = new Map<string, { symbol: string; name: string; decimals: number }>();
  m.set(NATIVE_MINT_STR, { symbol: "SOL", name: "Solana", decimals: 9 });
  m.set(USDC_MINT_MAINNET, { symbol: "USDC", name: "USD Coin", decimals: 6 });
  return m;
}

export async function loadJupiterTokenMap(): Promise<
  Map<string, { symbol: string; name: string; decimals: number }>
> {
  if (jupiterTokenCache) return jupiterTokenCache;
  let lastErr: unknown = null;
  for (const url of TOKEN_LIST_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseTokenListJson(await res.json());
      const map = tokenMapFromList(parsed);
      if (map.size > 0) {
        jupiterTokenCache = map;
        return map;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn("Could not load token list from any source; using minimal fallback.", lastErr);
  const m = minimalFallbackTokenMap();
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

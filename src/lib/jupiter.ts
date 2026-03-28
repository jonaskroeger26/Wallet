import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/** Wrapped SOL mint (Jupiter / Phantom convention). */
export const NATIVE_MINT_STR = "So11111111111111111111111111111111111111112";

/** Canonical mainnet USDC (Jupiter token list). */
export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const JUP_API = "https://quote-api.jup.ag/v6";

/** Minimal shape we read from Jupiter quote responses. */
export type JupiterQuote = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpactPct?: string;
  routePlan?: unknown[];
};

export function isJupiterQuote(x: unknown): x is JupiterQuote {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.inputMint === "string" &&
    typeof o.inAmount === "string" &&
    typeof o.outputMint === "string" &&
    typeof o.outAmount === "string"
  );
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}): Promise<JupiterQuote> {
  const url = new URL(`${JUP_API}/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("slippageBps", String(params.slippageBps));
  url.searchParams.set("swapMode", "ExactIn");
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) throw new Error(parseJupiterError(text));
  const parsed = JSON.parse(text) as unknown;
  if (!isJupiterQuote(parsed)) throw new Error("Unexpected quote response.");
  return parsed;
}

function parseJupiterError(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: string; message?: string };
    if (typeof j.error === "string") return j.error;
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return text || "Quote failed.";
}

export async function getSwapTransaction(
  quoteResponse: JupiterQuote,
  userPublicKey: string
): Promise<{ swapTransaction: string }> {
  const res = await fetch(`${JUP_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(parseJupiterError(text));
  return JSON.parse(text) as { swapTransaction: string };
}

/** Convert human amount (e.g. SOL or token UI) to raw integer string for the quote API. */
export function humanToRawAmount(
  inputMint: string,
  human: number,
  tokenMeta: Map<string, { decimals: number }>
): string {
  if (inputMint === NATIVE_MINT_STR) {
    return String(Math.floor(human * LAMPORTS_PER_SOL));
  }
  const meta = tokenMeta.get(inputMint);
  if (!meta) throw new Error("Unknown input token — pick a token from the list.");
  return String(BigInt(Math.floor(human * 10 ** meta.decimals)));
}

/** Format raw base units to a readable string (trim trailing zeros). */
export function rawToUiAmount(raw: string, decimals: number, maxFrac = 8): string {
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return "0";
  }
  if (decimals === 0) return v.toString();
  const base = 10n ** BigInt(decimals);
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / base;
  let frac = v % base;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fracStr.length > maxFrac) fracStr = fracStr.slice(0, maxFrac).replace(/0+$/, "") || "0";
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}

/** Compact number for rate lines (e.g. 1.234e6 for very large). */
export function formatCompactUi(s: string): string {
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return s;
  if (Math.abs(n) >= 1e9) return n.toExponential(3);
  if (Math.abs(n) >= 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

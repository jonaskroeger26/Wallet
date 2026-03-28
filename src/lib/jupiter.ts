/** Wrapped SOL mint (Jupiter / Phantom convention). */
export const NATIVE_MINT_STR = "So11111111111111111111111111111111111111112";

const JUP_API = "https://quote-api.jup.ag/v6";

export type JupiterQuoteResponse = Record<string, unknown>;

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}): Promise<JupiterQuoteResponse> {
  const url = new URL(`${JUP_API}/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("slippageBps", String(params.slippageBps));
  url.searchParams.set("swapMode", "ExactIn");
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Quote failed.");
  return JSON.parse(text) as JupiterQuoteResponse;
}

export async function getSwapTransaction(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string
): Promise<{ swapTransaction: string }> {
  const res = await fetch(`${JUP_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Swap build failed.");
  return JSON.parse(text) as { swapTransaction: string };
}

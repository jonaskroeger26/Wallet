import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ArrowDownUp,
  ChevronDown,
  Info,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { loadJupiterTokenMap } from "../lib/tokens";
import type { ParsedTokenRow } from "../lib/tokens";
import type { Cluster } from "../lib/cluster";
import type { JupiterQuote } from "../lib/jupiter";
import {
  NATIVE_MINT_STR,
  USDC_MINT_MAINNET,
  formatCompactUi,
  getQuote,
  getSwapTransaction,
  humanToRawAmount,
  isJupiterQuote,
  rawToUiAmount,
} from "../lib/jupiter";

export type SwapPanelProps = {
  cluster: Cluster;
  connection: Connection;
  keypair: Keypair;
  balanceLamports: number | null;
  tokenRows: ParsedTokenRow[];
  setError: (msg: string | null) => void;
  setStatus: (msg: string | null) => void;
  onSwapComplete: () => Promise<void>;
};

type TokenRow = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
};

const SLIPPAGE_PRESETS = [
  { label: "0.1%", bps: 10 },
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
];
const QUICK_SYMBOLS = ["USDC", "USDT", "JUP", "BONK"];

function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function SwapPanel({
  cluster,
  connection,
  keypair,
  balanceLamports,
  tokenRows,
  setError,
  setStatus,
  onSwapComplete,
}: SwapPanelProps) {
  const [metaMap, setMetaMap] = useState<Map<string, { symbol: string; name: string; decimals: number }>>(
    () => new Map()
  );
  const [tokenList, setTokenList] = useState<TokenRow[]>([]);
  const [inMint, setInMint] = useState(NATIVE_MINT_STR);
  const [outMint, setOutMint] = useState(USDC_MINT_MAINNET);
  const [amountStr, setAmountStr] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [slippageCustom, setSlippageCustom] = useState(false);
  const [customBpsStr, setCustomBpsStr] = useState("50");

  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [swapSubmitting, setSwapSubmitting] = useState(false);

  const [picker, setPicker] = useState<"in" | "out" | null>(null);
  const [search, setSearch] = useState("");

  const quoteSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const m = await loadJupiterTokenMap();
        if (cancelled) return;
        setMetaMap(m);
        const rows: TokenRow[] = [];
        for (const [address, t] of m) {
          rows.push({ address, symbol: t.symbol, name: t.name, decimals: t.decimals });
        }
        rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setTokenList(rows);
      } catch (e) {
        if (!cancelled) setQuoteError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveSlippageBps = useMemo(() => {
    if (!slippageCustom) return slippageBps;
    const n = Number(customBpsStr);
    if (!Number.isFinite(n) || n < 1 || n > 5000) return slippageBps;
    return Math.round(n);
  }, [slippageBps, slippageCustom, customBpsStr]);

  const symbolFor = useCallback(
    (mint: string) => {
      if (mint === NATIVE_MINT_STR) return "SOL";
      return metaMap.get(mint)?.symbol ?? shortAddr(mint);
    },
    [metaMap]
  );

  const nameFor = useCallback(
    (mint: string) => {
      if (mint === NATIVE_MINT_STR) return "Solana";
      return metaMap.get(mint)?.name ?? "Token";
    },
    [metaMap]
  );

  const balanceLabel = useCallback(
    (mint: string): string | null => {
      if (mint === NATIVE_MINT_STR) {
        if (balanceLamports == null) return null;
        return (balanceLamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        });
      }
      const row = tokenRows.find((r) => r.mint === mint);
      return row?.amountUi ?? null;
    },
    [balanceLamports, tokenRows]
  );

  useEffect(() => {
    setQuoteError(null);
    if (cluster !== "mainnet-beta") {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }
    if (metaMap.size === 0) {
      setQuote(null);
      return;
    }
    if (inMint === outMint) {
      setQuote(null);
      setQuoteError("Choose two different tokens.");
      return;
    }
    const human = Number(String(amountStr).replace(/,/g, ""));
    if (!Number.isFinite(human) || human <= 0) {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }

    const t = window.setTimeout(() => {
      const seq = ++quoteSeq.current;
      void (async () => {
        setQuoteLoading(true);
        try {
          let inputMint: string;
          let outputMint: string;
          try {
            inputMint = new PublicKey(inMint.trim()).toBase58();
            outputMint = new PublicKey(outMint.trim()).toBase58();
          } catch {
            if (seq !== quoteSeq.current) return;
            setQuote(null);
            setQuoteError("Invalid mint.");
            setQuoteLoading(false);
            return;
          }
          const raw = humanToRawAmount(inputMint, human, metaMap);
          if (raw === "0") {
            if (seq !== quoteSeq.current) return;
            setQuote(null);
            setQuoteLoading(false);
            return;
          }
          const q = await getQuote({
            inputMint,
            outputMint,
            amount: raw,
            slippageBps: effectiveSlippageBps,
          });
          if (seq !== quoteSeq.current) return;
          setQuote(q);
          setQuoteError(null);
        } catch (e) {
          if (seq !== quoteSeq.current) return;
          setQuote(null);
          setQuoteError(e instanceof Error ? e.message : String(e));
        } finally {
          if (seq === quoteSeq.current) setQuoteLoading(false);
        }
      })();
    }, 480);

    return () => {
      window.clearTimeout(t);
      quoteSeq.current += 1;
    };
  }, [amountStr, cluster, effectiveSlippageBps, inMint, metaMap, outMint]);

  const flip = () => {
    const a = inMint;
    setInMint(outMint);
    setOutMint(a);
    setAmountStr("");
    setQuote(null);
    setQuoteError(null);
  };

  const onMax = () => {
    if (inMint === NATIVE_MINT_STR) {
      const lamports = balanceLamports ?? 0;
      const reserve = 12_000_000;
      const max = Math.max(0, lamports - reserve);
      setAmountStr((max / LAMPORTS_PER_SOL).toFixed(9).replace(/\.?0+$/, ""));
      return;
    }
    const row = tokenRows.find((r) => r.mint === inMint);
    if (row) setAmountStr(row.amountUi);
  };

  const onHalf = () => {
    if (inMint === NATIVE_MINT_STR) {
      const lamports = balanceLamports ?? 0;
      const reserve = 12_000_000;
      const max = Math.max(0, lamports - reserve);
      setAmountStr((max / 2 / LAMPORTS_PER_SOL).toFixed(9).replace(/\.?0+$/, ""));
      return;
    }
    const row = tokenRows.find((r) => r.mint === inMint);
    if (!row) return;
    const n = Number(row.amountUi);
    if (!Number.isFinite(n)) return;
    setAmountStr((n / 2).toString());
  };

  const outDecimals = metaMap.get(outMint)?.decimals ?? 6;

  const outUi = quote
    ? rawToUiAmount(quote.outAmount, outDecimals, 8)
    : null;
  const minOutUi =
    quote?.otherAmountThreshold != null
      ? rawToUiAmount(quote.otherAmountThreshold, outDecimals, 8)
      : null;

  const rateLine = useMemo(() => {
    if (!quote || !metaMap.size) return null;
    const inHuman = Number(String(amountStr).replace(/,/g, ""));
    if (!Number.isFinite(inHuman) || inHuman <= 0) return null;
    const outN = Number(rawToUiAmount(quote.outAmount, outDecimals, 12));
    if (!Number.isFinite(outN) || outN <= 0) return null;
    const perIn = outN / inHuman;
    return `1 ${symbolFor(inMint)} ≈ ${formatCompactUi(String(perIn))} ${symbolFor(outMint)}`;
  }, [amountStr, metaMap.size, outDecimals, quote, symbolFor, inMint, outMint]);

  async function onConfirmSwap() {
    if (!quote || !isJupiterQuote(quote)) return;
    setSwapSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const { swapTransaction } = await getSwapTransaction(quote, keypair.publicKey.toBase58());
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
      tx.sign([keypair]);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );
      setStatus(`Swap confirmed · ${sig.slice(0, 8)}…`);
      setQuote(null);
      setAmountStr("");
      await onSwapComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwapSubmitting(false);
    }
  }

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokenList.slice(0, 80);
    return tokenList
      .filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
      )
      .slice(0, 120);
  }, [search, tokenList]);

  const mainnetOk = cluster === "mainnet-beta";
  const quickMints = useMemo(() => {
    const picks = new Set<string>([NATIVE_MINT_STR, USDC_MINT_MAINNET]);
    for (const symbol of QUICK_SYMBOLS) {
      const match = tokenList.find((t) => t.symbol.toUpperCase() === symbol);
      if (match) picks.add(match.address);
    }
    for (const row of tokenRows) {
      const amount = Number(row.amountUi);
      if (Number.isFinite(amount) && amount > 0) picks.add(row.mint);
      if (picks.size >= 7) break;
    }
    return Array.from(picks).slice(0, 7);
  }, [tokenList, tokenRows]);

  return (
    <div className="swap-panel">
      {!mainnetOk && (
        <div className="swap-banner" role="status">
          <Info className="swap-banner__icon" strokeWidth={2} />
          <div>
            <strong>Jupiter routes use mainnet liquidity.</strong> Lock your wallet and select{" "}
            <strong>Mainnet-beta</strong> in onboarding to swap.
          </div>
        </div>
      )}

      <div className="swap-card gradient-border glass noise">
        <div className="swap-card__glow swap-card__glow--tl" aria-hidden />
        <div className="swap-card__inner">
          <div className="swap-card__head">
            <h3>Token swap</h3>
            <span className="swap-card__network">{mainnetOk ? "Mainnet live" : "Mainnet required"}</span>
          </div>
          <div className="swap-section">
            <div className="swap-section__label-row">
              <span className="swap-section__label">You pay</span>
              {balanceLabel(inMint) != null && (
                <span className="swap-section__bal">
                  Balance: {balanceLabel(inMint)}
                  <button type="button" className="swap-pill" onClick={onHalf}>
                    HALF
                  </button>
                  <button type="button" className="swap-pill" onClick={onMax}>
                    MAX
                  </button>
                </span>
              )}
            </div>
            <div className="swap-row">
              <input
                className="swap-amount-input"
                inputMode="decimal"
                placeholder="0.0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={!mainnetOk}
              />
              <button
                type="button"
                className="swap-token-btn"
                onClick={() => {
                  setPicker("in");
                  setSearch("");
                }}
                disabled={!mainnetOk}
              >
                <span className="swap-token-btn__sym">{symbolFor(inMint)}</span>
                <ChevronDown className="swap-token-btn__chev" strokeWidth={2.2} />
              </button>
            </div>
            <div className="swap-token-meta">{nameFor(inMint)}</div>
          </div>

          <div className="swap-flip-wrap">
            <button type="button" className="swap-flip" onClick={flip} aria-label="Flip tokens" disabled={!mainnetOk}>
              <ArrowDownUp className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </div>

          <div className="swap-section">
            <div className="swap-section__label-row">
              <span className="swap-section__label">You receive</span>
              {balanceLabel(outMint) != null && (
                <span className="swap-section__bal">Balance: {balanceLabel(outMint)}</span>
              )}
            </div>
            <div className="swap-row swap-row--receive">
              <div className="swap-receive-val">
                {quoteLoading ? (
                  <span className="swap-muted">
                    <Loader2 className="swap-spin" strokeWidth={2} />
                    Fetching quote…
                  </span>
                ) : outUi != null ? (
                  <span className="swap-receive-num">{formatCompactUi(outUi)}</span>
                ) : (
                  <span className="swap-placeholder">—</span>
                )}
              </div>
              <button
                type="button"
                className="swap-token-btn"
                onClick={() => {
                  setPicker("out");
                  setSearch("");
                }}
                disabled={!mainnetOk}
              >
                <span className="swap-token-btn__sym">{symbolFor(outMint)}</span>
                <ChevronDown className="swap-token-btn__chev" strokeWidth={2.2} />
              </button>
            </div>
            <div className="swap-token-meta">{nameFor(outMint)}</div>
            {mainnetOk && quickMints.length > 0 && (
              <div className="swap-quick">
                <span className="swap-quick__label">Quick picks</span>
                <div className="swap-quick__list">
                  {quickMints.map((mint) => (
                    <button
                      key={mint}
                      type="button"
                      className={mint === outMint ? "swap-quick__pill swap-quick__pill--on" : "swap-quick__pill"}
                      onClick={() => setOutMint(mint)}
                    >
                      {symbolFor(mint)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="swap-slip">
            <span className="swap-slip__label">Slippage tolerance</span>
            <div className="swap-slip__pills">
              {SLIPPAGE_PRESETS.map((p) => (
                <button
                  key={p.bps}
                  type="button"
                  className={
                    !slippageCustom && slippageBps === p.bps ? "swap-slip-pill swap-slip-pill--on" : "swap-slip-pill"
                  }
                  onClick={() => {
                    setSlippageCustom(false);
                    setSlippageBps(p.bps);
                  }}
                  disabled={!mainnetOk}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={slippageCustom ? "swap-slip-pill swap-slip-pill--on" : "swap-slip-pill"}
                onClick={() => setSlippageCustom(true)}
                disabled={!mainnetOk}
              >
                Custom
              </button>
            </div>
            {slippageCustom && (
              <div className="swap-slip-custom">
                <label htmlFor="customSlip">Basis points (1–5000)</label>
                <input
                  id="customSlip"
                  inputMode="numeric"
                  value={customBpsStr}
                  onChange={(e) => setCustomBpsStr(e.target.value)}
                />
              </div>
            )}
          </div>

          {quoteError && <div className="swap-inline-err">{quoteError}</div>}

          {quote && mainnetOk && (
            <div className="swap-details">
              {rateLine && (
                <div className="swap-details__row">
                  <span>Rate</span>
                  <span className="swap-details__val">{rateLine}</span>
                </div>
              )}
              {quote.priceImpactPct != null && (
                <div className="swap-details__row">
                  <span>Price impact</span>
                  <span
                    className={
                      Number(quote.priceImpactPct) > 2 ? "swap-details__warn" : "swap-details__val"
                    }
                  >
                    {quote.priceImpactPct}%
                  </span>
                </div>
              )}
              {minOutUi != null && (
                <div className="swap-details__row">
                  <span>Minimum received</span>
                  <span className="swap-details__val">
                    {formatCompactUi(minOutUi)} {symbolFor(outMint)}
                  </span>
                </div>
              )}
              {Array.isArray(quote.routePlan) && quote.routePlan.length > 0 && (
                <div className="swap-details__row">
                  <span>Routes</span>
                  <span className="swap-details__val">
                    {quote.routePlan.length} path{quote.routePlan.length > 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="swap-cta primary btn-block"
            disabled={
              !mainnetOk ||
              swapSubmitting ||
              quoteLoading ||
              !quote ||
              !!quoteError
            }
            onClick={() => void onConfirmSwap()}
          >
            {swapSubmitting ? (
              <>
                <Loader2 className="swap-spin" strokeWidth={2} />
                Confirming…
              </>
            ) : !mainnetOk ? (
              "Switch to mainnet to swap"
            ) : quoteLoading ? (
              "Getting quote…"
            ) : !quote ? (
              "Enter an amount"
            ) : (
              "Swap now"
            )}
          </button>
        </div>
      </div>

      {picker && (
        <div
          className="token-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Select token"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPicker(null);
          }}
        >
          <div className="token-picker">
            <div className="token-picker__head">
              <span>Select token</span>
              <button type="button" className="token-picker__close" onClick={() => setPicker(null)} aria-label="Close">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
            <div className="token-picker__search">
              <Search className="token-picker__search-icon" strokeWidth={2} />
              <input
                autoFocus
                placeholder="Search name or mint"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="token-picker__list">
              <button
                type="button"
                className="token-picker__row token-picker__row--sol"
                onClick={() => {
                  if (picker === "in") setInMint(NATIVE_MINT_STR);
                  else setOutMint(NATIVE_MINT_STR);
                  setPicker(null);
                }}
              >
                <span className="token-picker__avatar">◎</span>
                <span className="token-picker__body">
                  <span className="token-picker__sym">SOL</span>
                  <span className="token-picker__sub">Solana · native</span>
                </span>
              </button>
              {filteredTokens.map((t) => (
                <button
                  key={t.address}
                  type="button"
                  className="token-picker__row"
                  onClick={() => {
                    if (picker === "in") setInMint(t.address);
                    else setOutMint(t.address);
                    setPicker(null);
                  }}
                >
                  <span className="token-picker__avatar">{t.symbol.slice(0, 2).toUpperCase()}</span>
                  <span className="token-picker__body">
                    <span className="token-picker__sym">{t.symbol}</span>
                    <span className="token-picker__sub">{t.name}</span>
                  </span>
                  <span className="token-picker__addr mono">{shortAddr(t.address)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

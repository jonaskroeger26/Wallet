import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState } from "react";

type Props = {
  balanceSol: string;
  balanceLoading: boolean;
  clusterLabel: string;
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  onRefresh: () => void;
};

export function PortfolioHero({
  balanceSol,
  balanceLoading,
  clusterLabel,
  onSend,
  onReceive,
  onSwap,
  onRefresh,
}: Props) {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <div className="portfolio-hero gradient-border glass noise">
      <div className="portfolio-hero__glow portfolio-hero__glow--tr" />
      <div className="portfolio-hero__glow portfolio-hero__glow--bl" />

      <div className="portfolio-hero__inner">
        <div className="portfolio-hero__top">
          <div>
            <div className="portfolio-hero__label-row">
              <span className="portfolio-hero__label">Total balance</span>
              <button
                type="button"
                className="portfolio-hero__eye"
                onClick={() => setShowBalance(!showBalance)}
                aria-label={showBalance ? "Hide balance" : "Show balance"}
              >
                {showBalance ? (
                  <Eye className="w-3.5 h-3.5" strokeWidth={2} />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" strokeWidth={2} />
                )}
              </button>
            </div>

            <h2 className="portfolio-hero__amount">
              {balanceLoading
                ? "…"
                : showBalance
                  ? balanceSol === "—"
                    ? "—"
                    : `${balanceSol} SOL`
                  : "••••••"}
            </h2>

            <div className="portfolio-hero__meta">
              <span className="portfolio-hero__pill portfolio-hero__pill--muted">{clusterLabel}</span>
              <button type="button" className="portfolio-hero__refresh" onClick={() => void onRefresh()}>
                <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                Refresh
              </button>
            </div>
          </div>

          <div className="portfolio-hero__chart" aria-hidden>
            <svg viewBox="0 0 160 80" className="portfolio-hero__chart-svg">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.20 165)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="oklch(0.72 0.20 165)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 60 Q20 55, 40 50 T80 35 T120 25 T160 15 L160 80 L0 80 Z"
                fill="url(#chartGrad)"
              />
              <path
                d="M0 60 Q20 55, 40 50 T80 35 T120 25 T160 15"
                fill="none"
                stroke="oklch(0.72 0.20 165)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <div className="portfolio-hero__actions">
          <button type="button" className="portfolio-hero__btn portfolio-hero__btn--primary" onClick={onSend}>
            <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
            Send
          </button>
          <button type="button" className="portfolio-hero__btn portfolio-hero__btn--secondary" onClick={onReceive}>
            <ArrowDownLeft className="w-4 h-4" strokeWidth={2} />
            Receive
          </button>
          <button type="button" className="portfolio-hero__btn portfolio-hero__btn--secondary" onClick={onSwap}>
            <RefreshCw className="w-4 h-4" strokeWidth={2} />
            Swap
          </button>
        </div>
      </div>
    </div>
  );
}

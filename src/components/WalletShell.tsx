import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import type { Cluster } from "../lib/cluster";

export type ShellTab =
  | "portfolio"
  | "tokens"
  | "swap"
  | "activity"
  | "nfts"
  | "settings"
  | "ai";

const MAIN_NAV: { id: ShellTab; label: string }[] = [
  { id: "portfolio", label: "Dashboard" },
  { id: "tokens", label: "Assets" },
  { id: "swap", label: "Swap" },
  { id: "activity", label: "Activity" },
  { id: "nfts", label: "NFTs" },
];

const BOTTOM_NAV: { id: ShellTab; label: string }[] = [
  { id: "ai", label: "AI Assistant" },
  { id: "settings", label: "Settings" },
];

type Props = {
  activeTab: ShellTab;
  onTabChange: (t: ShellTab) => void;
  address: string;
  copied: boolean;
  onCopyAddress: () => void;
  cluster: Cluster;
  onClusterChange: (c: Cluster) => void;
  /** When true, network cannot be changed until the wallet is locked. */
  networkDisabled?: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  children: ReactNode;
};

function NavIcon({ id }: { id: ShellTab }) {
  const cls = "w-5 h-5 shrink-0";
  switch (id) {
    case "portfolio":
      return <LayoutDashboard className={cls} strokeWidth={2} />;
    case "tokens":
      return <Coins className={cls} strokeWidth={2} />;
    case "swap":
      return <ArrowLeftRight className={cls} strokeWidth={2} />;
    case "activity":
      return <History className={cls} strokeWidth={2} />;
    case "nfts":
      return <ImageIcon className={cls} strokeWidth={2} />;
    case "settings":
      return <Settings className={cls} strokeWidth={2} />;
    case "ai":
      return <Sparkles className={cls} strokeWidth={2} />;
    default:
      return <LayoutDashboard className={cls} />;
  }
}

export function WalletShell({
  activeTab,
  onTabChange,
  address,
  copied,
  onCopyAddress,
  cluster,
  onClusterChange,
  networkDisabled = false,
  sidebarCollapsed,
  onToggleSidebar,
  children,
}: Props) {
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;

  return (
    <div className="wallet-layout">
      <aside
        className={
          sidebarCollapsed ? "wallet-sidebar wallet-sidebar--collapsed" : "wallet-sidebar"
        }
      >
        <div className="wallet-sidebar__brand">
          <div className="wallet-sidebar__logo wallet-sidebar__logo--mark">
            <img
              src="/ownwallet-mark.svg"
              width={44}
              height={44}
              alt=""
              className="wallet-sidebar__logo-img"
            />
          </div>
          {!sidebarCollapsed && (
            <div className="wallet-sidebar__titles">
              <h1 className="gradient-text">OwnWallet</h1>
              <p className="wallet-sidebar__subtitle">Solana</p>
            </div>
          )}
        </div>

        <nav className="wallet-sidebar__nav" aria-label="Primary">
          <div className="wallet-sidebar__group">
            {MAIN_NAV.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={active ? "wallet-nav-btn wallet-nav-btn--active" : "wallet-nav-btn"}
                  onClick={() => onTabChange(item.id)}
                >
                  <NavIcon id={item.id} />
                  {!sidebarCollapsed && <span className="wallet-nav-btn__label">{item.label}</span>}
                  {active && !sidebarCollapsed && <span className="wallet-nav-btn__dot" aria-hidden />}
                </button>
              );
            })}
          </div>

          <div className="wallet-sidebar__divider" />

          <div className="wallet-sidebar__group">
            {BOTTOM_NAV.map((item) => {
              const active = activeTab === item.id;
              const isAi = item.id === "ai";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    active
                      ? "wallet-nav-btn wallet-nav-btn--active"
                      : isAi
                        ? "wallet-nav-btn wallet-nav-btn--ai"
                        : "wallet-nav-btn"
                  }
                  onClick={() => onTabChange(item.id)}
                >
                  <NavIcon id={item.id} />
                  {!sidebarCollapsed && (
                    <span
                      className={
                        isAi && !active ? "wallet-nav-btn__label gradient-text" : "wallet-nav-btn__label"
                      }
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <button
          type="button"
          className="wallet-sidebar__collapse"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>

        <div className="wallet-sidebar__footer">
          <label className="wallet-sidebar__network-label">
            {!sidebarCollapsed ? "Network" : ""}
            <select
              className="wallet-sidebar__select"
              value={cluster}
              disabled={networkDisabled}
              onChange={(e) => onClusterChange(e.target.value as Cluster)}
              title="Network"
            >
              <option value="devnet">Devnet</option>
              <option value="mainnet-beta">Mainnet</option>
            </select>
          </label>
          {!sidebarCollapsed && (
            <div className="wallet-sidebar__user">
              <div className="wallet-sidebar__avatar animated-gradient" />
              <div className="wallet-sidebar__user-meta">
                <p className="wallet-sidebar__user-addr">{short}</p>
                <p className="wallet-sidebar__user-status">Connected</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="wallet-main-column">
        <header className="wallet-topbar">
          <div className="wallet-topbar__search-wrap">
            <Search className="wallet-topbar__search-icon" strokeWidth={2} />
            <input
              type="search"
              className="wallet-topbar__search"
              placeholder="Search tokens, transactions…"
              disabled
              aria-disabled="true"
            />
          </div>
          <div className="wallet-topbar__actions">
            <button type="button" className="wallet-topbar__icon-btn" aria-label="Notifications">
              <Bell className="w-5 h-5" strokeWidth={2} />
              <span className="wallet-topbar__notif-dot" />
            </button>
            <span className="wallet-topbar__sep" />
            <button type="button" className="wallet-topbar__addr" onClick={() => void onCopyAddress()}>
              <span className="wallet-topbar__live" />
              <span className="wallet-topbar__addr-text">{short}</span>
              {copied ? (
                <Check className="w-4 h-4 wallet-topbar__check" strokeWidth={2.5} />
              ) : (
                <Copy className="w-4 h-4 wallet-topbar__copy-ico" strokeWidth={2} />
              )}
            </button>
          </div>
        </header>

        <main className="wallet-main-inner">{children}</main>
      </div>
    </div>
  );
}

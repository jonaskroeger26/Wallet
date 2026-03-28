# Wallet

Solana web wallet with **Phantom-style** features in the browser: 12-word recovery phrase, HD accounts, SOL + SPL, Jupiter swap, activity history, address book, and optional NFT previews (Helius).

## What is (and is not) “like Phantom”

| Area | This project | Phantom |
|------|----------------|---------|
| Recovery phrase + HD (`m/44'/501'/…`) | Yes | Yes |
| Multiple accounts | Yes (indexes 0–19) | Yes |
| SOL + SPL | Yes (SPL send: standard Token program) | Full Token-2022 / extensions |
| Swap | Jupiter v6 (mainnet) | Jupiter + in-app UX |
| Collectibles | Optional via `VITE_HELIUS_API_KEY` | Full gallery + metadata |
| Browser extension + injected `window.solana` | **No** (web app only) | Yes |
| Mobile apps, fiat on-ramp, MPC email login | **No** | Yes |
| Hardware wallet | **No** | Yes |
| Staking UI | **No** | Yes |

Treat this as a **learning / self-custody web wallet**, not a drop-in replacement for Phantom’s product or security review.

## Requirements

- Node.js 18+
- npm

## Run locally

```bash
git clone https://github.com/jonaskroeger26/Wallet.git
cd Wallet
npm install
npm run dev
```

Open the URL shown (usually `http://localhost:5173`).

## Environment (optional)

Copy `.env.example` to `.env`:

- **`VITE_SOLANA_RPC_*`** — faster or more reliable RPC than the public cluster URLs.
- **`VITE_HELIUS_API_KEY`** — enables the **Collectibles** tab (NFT list via Helius).

## Build

```bash
npm run build
npm run preview
```

## Security

- By default the app saves the vault **without a password** (JSON in `localStorage`, key `wallet.plain.v1`). Anyone with access to this browser profile can read it. **Optional password encryption** is planned for a later release; older installs that already used a password still unlock with that password.
- This is **not** a hardware wallet or audited custody stack.
- Use **devnet** while experimenting. **Mainnet** uses real SOL; Jupiter swap is **mainnet** liquidity.

## Repository

[github.com/jonaskroeger26/Wallet](https://github.com/jonaskroeger26/Wallet)

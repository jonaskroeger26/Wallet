# Wallet

Solana web wallet with **Phantom-style** features in the browser: 12-word recovery phrase, HD accounts, SOL + SPL, Jupiter swap, activity history, address book, optional NFT previews (Helius), and an **offline** assistant (no API keys).

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

Treat this as a **learning / self-custody web wallet**, not a drop-in replacement for Phantom’s product or a formal security audit.

## Requirements

- **Node.js 18+** (see `engines` in `package.json`)
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

The in-app assistant is **offline** (see `src/lib/local-assistant.ts`) — no cloud AI keys.

## Build & quality checks

```bash
npm run build      # Typecheck + production bundle
npm run preview    # Serve ./dist locally
npm run test:run   # Unit tests (Vitest)
npm run check      # test:run + build (recommended before release)
```

## Testing

Automated tests cover:

- Jupiter amount helpers (`src/lib/jupiter.test.ts`)
- Mnemonic generation / HD derivation (`src/lib/mnemonic.test.ts`)
- Encrypted vault crypto round-trip (`src/lib/vault-crypto.test.ts`)
- Offline assistant matching (`src/lib/local-assistant.test.ts`)

**Manual QA before launch (suggested):**

1. Create wallet → backup phrase → unlock → lock → unlock with phrase import path.
2. **Devnet:** airdrop → send SOL → refresh balance.
3. **Mainnet (small amounts):** quote + swap path; confirm explorer link in Activity.
4. **Settings:** address book add/remove; Lock / Forget (on a throwaway wallet).

## Security

- **Plain vault:** Saving without a password stores JSON in `localStorage` (`wallet.plain.v1`). Anyone with access to this browser profile can read it.
- **Encrypted vault:** Unlock-with-password flow uses AES-GCM + PBKDF2 (`src/lib/vault-crypto.ts`). If you forget the password, you need your recovery phrase.
- This is **not** a hardware wallet or audited custody stack.
- Use **devnet** while learning. **Mainnet** uses real SOL; Jupiter uses **mainnet** liquidity.

## Supply chain / `npm audit`

Some transitive advisories (e.g. via `@solana/spl-token`, `vite-plugin-node-polyfills`) may still report under `npm audit`. Fixes often require **breaking** major-version jumps — run `npm audit fix --force` only after testing. Prefer pinned deps and periodic upgrades on a branch.

## Repository

[github.com/jonaskroeger26/Wallet](https://github.com/jonaskroeger26/Wallet)

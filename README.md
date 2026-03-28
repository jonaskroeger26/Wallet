# Wallet

Solana web wallet: create or import a keypair, encrypt it in the browser with a password, view balance, request **devnet SOL**, and send SOL.

## What you need

- **Node.js** 18+ ([nodejs.org](https://nodejs.org/) or `nvm install --lts`)
- **npm** (comes with Node)

## Run the app locally

1. **Get the code**

   ```bash
   git clone https://github.com/jonaskroeger26/Wallet.git
   cd Wallet
   ```

   Or open the `Wallet` folder if you already have it.

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the dev server**

   ```bash
   npm run dev
   ```

4. **Open the app** — the terminal prints a URL (usually `http://localhost:5173`). Open it in your browser.

## Use the wallet (devnet)

1. Keep **Network** on **Devnet** (default).
2. **Create a new wallet**: set a password (8+ characters) → **Create new wallet**.  
   Or **Import** a base58 secret key and the same password → **Import and save**.
3. **Unlock** later with **Unlock saved wallet** if you already saved a vault in this browser.
4. **Fund devnet**: click **Request 1 SOL (devnet airdrop)**.  
   If it fails (rate limit / faucet), wait a few minutes or use another [devnet faucet](https://faucet.solana.com/) with your copied address.
5. **Send SOL**: paste a recipient address, amount in SOL → **Send SOL**.
6. **Lock** when done; **Forget saved wallet** removes the encrypted vault from this browser.

Optional: copy `.env.example` to `.env` and set `VITE_SOLANA_RPC_DEVNET` / `VITE_SOLANA_RPC_MAINNET` for a dedicated RPC (e.g. Helius).

## Production build

```bash
npm run build
npm run preview
```

`dist/` is static files you can host on any static host (Netlify, Vercel, Cloudflare Pages, etc.).

## Security

- **Starter only**: browser storage + password encryption is not a hardware wallet or audited custody system. Do not use for large mainnet funds without a serious security review.
- Use **devnet** while learning. **Mainnet-beta** uses real SOL.

## Repo

Source: [github.com/jonaskroeger26/Wallet](https://github.com/jonaskroeger26/Wallet)

## Next ideas

- Jupiter swap API (quotes + swap transactions)
- SPL token balances and transfers
- React Native / Expo for a mobile app

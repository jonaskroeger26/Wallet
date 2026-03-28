# Wallet

Solana web wallet starter: create or import a keypair, encrypt it in the browser with a password, check balance, send SOL. Defaults to **devnet**.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Security

- This is a **starter**: browser storage and password-based encryption are not a substitute for a hardware wallet or audited mobile stack for large amounts.
- Prefer **devnet** while experimenting.

## Push to GitHub

```bash
cd Wallet
git init
git add .
git commit -m "Initial Solana wallet scaffold"
git branch -M main
git remote add origin https://github.com/jonaskroeger26/Wallet.git
git push -u origin main
```

If the remote already exists from `git clone`, skip `git init` / `remote add` and push as usual.

## Next steps

- Jupiter swap API (quotes + swap transactions)
- SPL token accounts and transfers
- React Native / Expo for a Jupiter Mobile–style app

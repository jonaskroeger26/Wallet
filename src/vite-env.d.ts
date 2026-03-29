/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_DEVNET?: string;
  readonly VITE_SOLANA_RPC_MAINNET?: string;
  readonly VITE_HELIUS_API_KEY?: string;
  readonly VITE_TOKEN_LIST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

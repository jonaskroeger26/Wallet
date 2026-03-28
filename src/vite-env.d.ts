/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_DEVNET?: string;
  readonly VITE_SOLANA_RPC_MAINNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

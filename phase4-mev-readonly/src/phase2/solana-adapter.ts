/**
 * Read-only adapter contracts for the Solana RPC and Jito block engine.
 * Deliberately excludes sendTransaction, sendBundle, and signing methods.
 */
export interface SolanaReadOnlyAdapter {
  getBalanceLamports(owner: string): Promise<bigint>;
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  getCurrentSlot(): Promise<number>;
  getFeeForMessage(serializedMessage: Uint8Array): Promise<bigint>;
  simulateSerializedTransaction(serializedTransaction: Uint8Array): Promise<{
    err: unknown | null;
    logs: string[];
    slot: number;
    feeLamports: bigint;
  }>;
}

export interface JitoReadOnlyAdapter {
  getTipAccounts(): Promise<string[]>;
}

/** Adapter contract tests must verify that only the documented read methods are exposed. */
export function assertTipAccounts(accounts: string[]): void {
  if (accounts.length === 0 || accounts.some((account) => typeof account !== "string" || account.length < 32)) {
    throw new Error("JITO_TIP_ACCOUNTS_INVALID");
  }
}

export const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

const READ_ONLY_METHODS = new Set([
  "getHealth",
  "getGenesisHash",
  "getSlot",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenSupply",
  "getTokenLargestAccounts",
  "getEpochInfo",
  "getVersion",
  "getLeaderSchedule",
  "getSlotLeader",
  "getSlotLeaders",
  "getTipAccounts"
]);

const BLOCKED_METHODS = new Set([
  "sendTransaction",
  "sendRawTransaction",
  "sendBundle",
  "sendPrivateTransaction",
  "requestAirdrop",
  "signTransaction",
  "signAllTransactions"
]);

export function assertReadOnlyMethod(method: string): void {
  if (BLOCKED_METHODS.has(method) || !READ_ONLY_METHODS.has(method)) {
    throw new Error(`READ_ONLY_POLICY_BLOCKED_METHOD:${method}`);
  }
}

export function readOnlyFlags(env: NodeJS.ProcessEnv = process.env) {
  const requiredFalse = [
    "LIVE_TRADING",
    "TRANSACTION_SIGNING_ENABLED",
    "SEND_TRANSACTION_ENABLED",
    "SEND_BUNDLE_ENABLED"
  ];
  const violations = requiredFalse.filter((key) => env[key] !== "false");
  if (env.APP_MODE !== "READ_ONLY" || violations.length > 0) {
    throw new Error(`READ_ONLY_POLICY_INVALID: mode=${env.APP_MODE ?? "unset"}; flags=${violations.join(",")}`);
  }
  return {
    mode: "READ_ONLY" as const,
    liveTrading: false as const,
    signing: false as const,
    transactionSubmission: false as const,
    bundleSubmission: false as const
  };
}

export function requireHttpsEndpoint(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name}_MISSING`);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "wss:") {
    throw new Error(`${name}_MUST_USE_TLS`);
  }
  return url;
}

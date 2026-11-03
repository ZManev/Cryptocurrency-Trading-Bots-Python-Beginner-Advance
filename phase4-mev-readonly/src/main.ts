import { Connection, PublicKey } from "@solana/web3.js";
import {
  MAINNET_GENESIS_HASH,
  assertReadOnlyMethod,
  readOnlyFlags,
  requireHttpsEndpoint
} from "./read-only.js";

type Check = { status: "PASS" | "FAIL" | "NOT RUN"; detail?: unknown };

const results: Record<string, Check> = {};
const timeoutMs = 12_000;

async function runCheck(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    results[name] = { status: "PASS", detail: await fn() };
  } catch (error) {
    results[name] = {
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function jsonRpcReadOnly(
  endpoint: URL,
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  assertReadOnlyMethod(method);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "JSON_RPC_ERROR");
  return payload.result;
}

async function main(): Promise<void> {
  const safety = readOnlyFlags();
  if (process.env.SOLANA_CLUSTER !== "mainnet-beta") {
    throw new Error("SOLANA_CLUSTER_MUST_BE_MAINNET_BETA");
  }

  const rpcUrl = requireHttpsEndpoint(process.env.SOLANA_RPC_URL, "SOLANA_RPC_URL");
  const wsUrl = requireHttpsEndpoint(process.env.SOLANA_WS_URL, "SOLANA_WS_URL");
  if (wsUrl.protocol !== "wss:") throw new Error("SOLANA_WS_URL_MUST_USE_WSS");

  const connection = new Connection(rpcUrl.toString(), {
    commitment: "confirmed",
    wsEndpoint: wsUrl.toString()
  });

  await runCheck("rpc_getHealth", async () => {
    const value = await jsonRpcReadOnly(rpcUrl, "getHealth");
    if (value !== "ok") throw new Error(`RPC_UNHEALTHY:${String(value)}`);
    return value;
  });

  await runCheck("rpc_genesisHash", async () => {
    const value = await jsonRpcReadOnly(rpcUrl, "getGenesisHash");
    if (value !== MAINNET_GENESIS_HASH) throw new Error("WRONG_CLUSTER_GENESIS_HASH");
    return value;
  });

  await runCheck("rpc_slot", async () => {
    const value = await jsonRpcReadOnly(rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
    if (typeof value !== "number" || value <= 0) throw new Error("INVALID_SLOT");
    return value;
  });

  const mints = [
    process.env.RAYDIUM_INPUT_MINT ?? "So11111111111111111111111111111111111111112",
    process.env.RAYDIUM_OUTPUT_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  ];

  await runCheck("rpc_mint_accounts", async () => {
    const values = await Promise.all(mints.map(async (mint) => {
      const address = new PublicKey(mint);
      const info = await connection.getAccountInfo(address, "confirmed");
      if (!info) throw new Error(`MINT_ACCOUNT_NOT_FOUND:${mint}`);
      return { mint, ownerProgram: info.owner.toBase58(), dataLength: info.data.length };
    }));
    return values;
  });

  await runCheck("websocket_slot_subscription", async () => {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let subscriptionId: number | undefined;
      const timer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        if (subscriptionId !== undefined) {
          try { await connection.removeSlotChangeListener(subscriptionId); } catch {}
        }
        reject(new Error("NO_SLOT_EVENT_WITHIN_TIMEOUT"));
      }, 10_000);

      subscriptionId = connection.onSlotChange((event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (subscriptionId !== undefined) {
          void connection.removeSlotChangeListener(subscriptionId).catch(() => undefined);
        }
        resolve({ slot: event.slot, parent: event.parent, root: event.root });
      });
    });
  });

  await runCheck("raydium_quote", async () => {
    const amount = process.env.RAYDIUM_INPUT_AMOUNT ?? "10000000";
    const slippage = process.env.RAYDIUM_SLIPPAGE_BPS ?? "50";
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error("INVALID_INPUT_AMOUNT");
    if (!/^\d+$/.test(slippage) || Number(slippage) > 10_000) throw new Error("INVALID_SLIPPAGE_BPS");

    const url = new URL("https://transaction-v1.raydium.io/compute/swap-base-in");
    url.searchParams.set("inputMint", mints[0]);
    url.searchParams.set("outputMint", mints[1]);
    url.searchParams.set("amount", amount);
    url.searchParams.set("slippageBps", slippage);
    url.searchParams.set("txVersion", "V0");

    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`RAYDIUM_HTTP_${response.status}`);
    const payload = await response.json() as {
      success?: boolean;
      data?: {
        inputMint?: string;
        outputMint?: string;
        inputAmount?: string;
        outputAmount?: string;
        otherAmountThreshold?: string;
        priceImpactPct?: string;
        routePlan?: unknown[];
      };
    };
    if (!payload.success || !payload.data) throw new Error("RAYDIUM_QUOTE_REJECTED");
    if (payload.data.inputMint !== mints[0] || payload.data.outputMint !== mints[1]) {
      throw new Error("RAYDIUM_QUOTE_MINT_MISMATCH");
    }
    return {
      inputMint: payload.data.inputMint,
      outputMint: payload.data.outputMint,
      inputAmount: payload.data.inputAmount,
      outputAmount: payload.data.outputAmount,
      minimumOutput: payload.data.otherAmountThreshold,
      priceImpactPct: payload.data.priceImpactPct,
      routeHops: payload.data.routePlan?.length ?? null,
      observedAt: new Date().toISOString()
    };
  });

  await runCheck("jito_getTipAccounts", async () => {
    const endpoint = requireHttpsEndpoint(
      process.env.JITO_TIP_ACCOUNTS_URL ?? "https://mainnet.block-engine.jito.wtf/api/v1/getTipAccounts",
      "JITO_TIP_ACCOUNTS_URL"
    );
    const value = await jsonRpcReadOnly(endpoint, "getTipAccounts", []);
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string")) {
      throw new Error("INVALID_JITO_TIP_ACCOUNTS_RESPONSE");
    }
    return { count: value.length, accounts: value };
  });

  const failed = Object.values(results).filter((item) => item.status === "FAIL").length;
  console.log(JSON.stringify({
    schema: "solana.mainnet.readonly.proof.v1",
    generatedAt: new Date().toISOString(),
    cluster: "mainnet-beta",
    safety,
    checks: results,
    summary: {
      total: Object.keys(results).length,
      passed: Object.values(results).filter((item) => item.status === "PASS").length,
      failed,
      status: failed === 0 ? "PASS" : "FAIL"
    },
    explicitGuarantees: {
      transactionSigning: false,
      transactionSubmission: false,
      jitoBundleSubmission: false,
      walletPrivateKeyLoaded: false
    }
  }, null, 2));

  if (failed > 0) process.exitCode = 1;
  // The slot subscription is removed after the first observed event.
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema: "solana.mainnet.readonly.proof.v1",
    status: "FAIL",
    fatal: error instanceof Error ? error.message : String(error),
    transactionSigning: false,
    transactionSubmission: false,
    jitoBundleSubmission: false
  }, null, 2));
  process.exitCode = 1;
});

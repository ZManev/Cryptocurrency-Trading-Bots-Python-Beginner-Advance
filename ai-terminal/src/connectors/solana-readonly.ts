import type { Candidate } from "../domain/types.js";

export type CheckStatus = "PASS" | "FAIL" | "NOT_VERIFIED";
export interface RpcHealth {
  status: CheckStatus;
  endpoint: string;
  slot?: number;
  blockHeight?: number;
  version?: string;
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}
export interface WebSocketHealth {
  status: CheckStatus;
  endpoint: string;
  observedSlot?: number;
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}
export interface ReadOnlySolanaConfig {
  rpcUrl: string;
  wsUrl: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
}
const safeEndpoint = (raw: string): string => {
  try { const u = new URL(raw); return `${u.protocol}//${u.host}`; }
  catch { return "[invalid endpoint]"; }
};
const rpcCall = async <T>(url: string, method: string, params: unknown[], fetcher: typeof fetch, timeoutMs: number): Promise<T> => {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
  const payload = await response.json() as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "RPC_ERROR");
  if (payload.result === undefined) throw new Error("RPC_RESULT_MISSING");
  return payload.result;
};

export async function checkSolanaRpc(config: ReadOnlySolanaConfig): Promise<RpcHealth> {
  const started = Date.now();
  const fetcher = config.fetcher ?? fetch;
  const timeout = config.timeoutMs ?? 8_000;
  try {
    const [slot, blockHeight, version] = await Promise.all([
      rpcCall<number>(config.rpcUrl, "getSlot", [{ commitment: "confirmed" }], fetcher, timeout),
      rpcCall<number>(config.rpcUrl, "getBlockHeight", [{ commitment: "confirmed" }], fetcher, timeout),
      rpcCall<{ "solana-core"?: string }>(config.rpcUrl, "getVersion", [], fetcher, timeout)
    ]);
    return { status: "PASS", endpoint: safeEndpoint(config.rpcUrl), slot, blockHeight, ...(version["solana-core"] ? { version: version["solana-core"] } : {}), latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: "FAIL", endpoint: safeEndpoint(config.rpcUrl), latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "RPC_FAILED" };
  }
}

/** Subscribes to slot notifications only. Never sends transactions or signatures. */
export async function checkSolanaWebSocket(config: ReadOnlySolanaConfig): Promise<WebSocketHealth> {
  const started = Date.now();
  const WebSocketImpl = config.WebSocketImpl ?? globalThis.WebSocket;
  const timeout = config.timeoutMs ?? 8_000;
  if (!WebSocketImpl) return { status: "NOT_VERIFIED", endpoint: safeEndpoint(config.wsUrl), checkedAt: new Date().toISOString(), error: "WEBSOCKET_UNAVAILABLE" };
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | undefined;
    const finish = (result: WebSocketHealth) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* best effort */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "NOT_VERIFIED", endpoint: safeEndpoint(config.wsUrl), checkedAt: new Date().toISOString(), error: "WEBSOCKET_TIMEOUT" }), timeout);
    try {
      socket = new WebSocketImpl(config.wsUrl);
      socket.addEventListener("open", () => socket?.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "slotSubscribe" })));
      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { id?: number; result?: number; params?: { result?: { slot?: number } } };
          if (data.id === 1 && typeof data.result === "number") return;
          const slot = data.params?.result?.slot;
          if (typeof slot === "number") finish({ status: "PASS", endpoint: safeEndpoint(config.wsUrl), observedSlot: slot, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() });
        } catch { /* ignore non-JSON frames */ }
      });
      socket.addEventListener("error", () => finish({ status: "FAIL", endpoint: safeEndpoint(config.wsUrl), checkedAt: new Date().toISOString(), error: "WEBSOCKET_CONNECTION_ERROR" }));
    } catch {
      finish({ status: "FAIL", endpoint: safeEndpoint(config.wsUrl), checkedAt: new Date().toISOString(), error: "WEBSOCKET_CONNECTION_FAILED" });
    }
  });
}

export interface RaydiumPoolSummary {
  poolId: string;
  mintA: string;
  mintB: string;
  liquidityUsd?: number;
  volume24hUsd?: number;
}
export async function discoverRaydiumPools(mint: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<RaydiumPoolSummary[]> {
  if (!mint.trim()) throw new Error("MINT_REQUIRED");
  const url = new URL("https://api-v3.raydium.io/pools/info/mint");
  url.searchParams.set("mint1", mint);
  url.searchParams.set("poolType", "all");
  url.searchParams.set("poolSortField", "liquidity");
  url.searchParams.set("sortType", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "20");
  const response = await (options.fetcher ?? fetch)(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(options.timeoutMs ?? 8_000) });
  if (!response.ok) throw new Error(`RAYDIUM_HTTP_${response.status}`);
  const envelope = await response.json() as { success?: boolean; data?: unknown; msg?: string };
  if (envelope.success !== true) throw new Error("RAYDIUM_INVALID_RESPONSE");
  const outer = envelope.data as { data?: unknown[]; list?: unknown[] } | unknown[] | undefined;
  const rows = Array.isArray(outer) ? outer : Array.isArray(outer?.data) ? outer.data : Array.isArray(outer?.list) ? outer.list : [];
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const mintAddress = (v: unknown) => typeof v === "string" ? v : v && typeof v === "object" && typeof (v as Record<string, unknown>).address === "string" ? (v as Record<string, string>).address : undefined;
    const poolId = typeof row.id === "string" ? row.id : typeof row.ammId === "string" ? row.ammId : undefined;
    const mintA = mintAddress(row.mintA), mintB = mintAddress(row.mintB);
    if (!poolId || !mintA || !mintB) return [];
    const num = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; };
    const day = row.day && typeof row.day === "object" ? row.day as Record<string, unknown> : {};
    const liquidityUsd = num(row.tvl) ?? num(row.liquidity);\n    const volume24hUsd = num(day.volume) ?? num(row.volume24h);\n    return [{ poolId, mintA, mintB, ...(liquidityUsd !== undefined ? { liquidityUsd } : {}), ...(volume24hUsd !== undefined ? { volume24hUsd } : {}) }];
  });
}

export async function getJitoReadOnlyDiagnostics(options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<{ status: CheckStatus; tipAccounts?: number; checkedAt: string; error?: string }> {
  try {
    const response = await (options.fetcher ?? fetch)("https://mainnet.block-engine.jito.wtf/api/v1/bundles", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000)
    });
    if (!response.ok) throw new Error(`JITO_HTTP_${response.status}`);
    const payload = await response.json() as { result?: unknown[]; error?: { message?: string } };
    if (payload.error || !Array.isArray(payload.result)) throw new Error(payload.error?.message ?? "JITO_INVALID_RESPONSE");
    return { status: "PASS", tipAccounts: payload.result.length, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: "NOT_VERIFIED", checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "JITO_CHECK_FAILED" };
  }
}

export function solanaCandidateFromPool(pool: RaydiumPoolSummary): Candidate {
  return {
    id: pool.poolId, chain: "solana", symbol: `${pool.mintA.slice(0, 5)}/${pool.mintB.slice(0, 5)}`,
    venue: "Raydium", liquidityUsd: pool.liquidityUsd ?? 0, volume24hUsd: pool.volume24hUsd ?? 0,
    ageMinutes: 0, mintAuthorityRevoked: false, freezeAuthorityRevoked: false,
    holderConcentrationPct: 100, spreadBps: 10_000
  };
}

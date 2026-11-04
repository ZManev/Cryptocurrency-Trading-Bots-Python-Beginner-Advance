import { describe, expect, it } from "vitest";
import { checkSolanaRpc, discoverRaydiumPools, getJitoReadOnlyDiagnostics } from "../src/connectors/solana-readonly.js";

const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

describe("Solana read-only adapters", () => {
  it("checks RPC slot, block height and version without transaction methods", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      calls++;
      const body = JSON.parse(String(init?.body)) as { method: string };
      const result = body.method === "getSlot" ? 123 : body.method === "getBlockHeight" ? 100 : { "solana-core": "test-validator" };
      return response({ result });
    };
    const result = await checkSolanaRpc({ rpcUrl: "https://rpc.example/?api-key=secret", wsUrl: "wss://rpc.example", fetcher });
    expect(result.status).toBe("PASS");
    expect(result.slot).toBe(123);
    expect(result.endpoint).toBe("https://rpc.example");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(calls).toBe(3);
  });

  it("reports RPC errors as FAIL without throwing", async () => {
    const result = await checkSolanaRpc({ rpcUrl: "https://rpc.example", wsUrl: "wss://rpc.example", fetcher: async () => response({ error: { message: "provider unavailable" } }) });
    expect(result.status).toBe("FAIL");
  });

  it("normalizes Raydium pool metadata", async () => {
    const fetcher: typeof fetch = async () => response({ success: true, data: { data: [{ id: "pool1", mintA: "mintA", mintB: "mintB", tvl: "1000", day: { volume: "500" } }] } });
    const pools = await discoverRaydiumPools("mintA", { fetcher });
    expect(pools).toEqual([{ poolId: "pool1", mintA: "mintA", mintB: "mintB", liquidityUsd: 1000, volume24hUsd: 500 }]);
  });

  it("does not mark Jito healthy when provider errors", async () => {
    const result = await getJitoReadOnlyDiagnostics({ fetcher: async () => response({ error: { message: "unavailable" } }) });
    expect(result.status).toBe("NOT_VERIFIED");
  });
});

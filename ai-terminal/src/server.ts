import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkSolanaRpc, checkSolanaWebSocket, discoverRaydiumPools, getJitoReadOnlyDiagnostics } from "./connectors/solana-readonly.js";

const host = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const port = Number(process.env.DASHBOARD_PORT ?? 8787);
const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const wsUrl = process.env.SOLANA_WS_URL ?? "wss://api.mainnet-beta.solana.com";
const htmlPath = fileURLToPath(new URL("../dashboard/index.html", import.meta.url));
const send = (res: import("node:http").ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(value));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/") {
    try { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(await readFile(htmlPath)); }
    catch { res.writeHead(500); res.end("Dashboard asset unavailable"); }
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    send(res, 200, { product: "AI Multi-Agent Trading Terminal", mode: "SOLANA_MAINNET_READ_ONLY", signingEnabled: false, submissionEnabled: false, liveTradingEnabled: false, killSwitch: true, checkedAt: new Date().toISOString() });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/solana/health") {
    const [rpc, websocket] = await Promise.all([
      checkSolanaRpc({ rpcUrl, wsUrl }), checkSolanaWebSocket({ rpcUrl, wsUrl })
    ]);
    send(res, 200, { rpc, websocket, overall: rpc.status === "PASS" && websocket.status === "PASS" ? "PASS" : "NOT_VERIFIED" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/solana/raydium/pools") {
    const mint = url.searchParams.get("mint") ?? "So11111111111111111111111111111111111111112";
    try { send(res, 200, { status: "PASS", source: "Raydium API v3 pool metadata", pools: await discoverRaydiumPools(mint) }); }
    catch (error) { send(res, 503, { status: "NOT_VERIFIED", error: error instanceof Error ? error.message : "RAYDIUM_UNAVAILABLE", pools: [] }); }
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/solana/jito/diagnostics") {
    send(res, 200, await getJitoReadOnlyDiagnostics());
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/")) {
    send(res, 403, { error: "READ_ONLY_MODE: signing and transaction submission are disabled" });
    return;
  }
  send(res, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  process.stdout.write(`AI Terminal dashboard listening at http://${host}:${port}\n`);
});

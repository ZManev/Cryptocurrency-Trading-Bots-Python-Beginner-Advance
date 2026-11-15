import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("clears health metrics and both statuses after a successful check followed by a failed refresh", async () => {
  const elements = new Map<string, { textContent: string; className: string; children: unknown[]; prepend: () => void; addEventListener: () => void }>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { textContent: "", className: "", children: [], prepend() {}, addEventListener() {} });
    return elements.get(id)!;
  };
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ rpc: { status: "PASS", slot: 123, blockHeight: 100, latencyMs: 5 }, websocket: { status: "PASS", observedSlot: 124 } }) }).mockRejectedValueOnce(new Error("offline"));
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  const context = { document: { getElementById: element, createElement: () => ({ innerHTML: "" }) }, fetch: fetcher, setInterval() {} };
  // Omit automatic refresh so only the health flow is exercised.
  runInNewContext(script.replace('$("refresh").addEventListener("click",refresh);refresh();setInterval(health,30000);', ""), context);
  await runInNewContext("health()", context);
  expect(element("wsStatus").textContent).toBe("PASS");
  expect(element("slot").textContent).toBe("124");
  await runInNewContext("health()", context);
  for (const id of ["rpcStatus", "wsStatus"]) expect(element(id).textContent).toBe("NOT VERIFIED");
  for (const id of ["slot", "height"]) expect(element(id).textContent).toBe("—");
  expect(element("rpcLatency").textContent).toBe("not verified");
});

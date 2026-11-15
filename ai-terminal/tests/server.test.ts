import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, it, vi } from "vitest";

const { capture } = vi.hoisted(() => ({ capture: { handler: undefined as unknown } }));
vi.mock("node:http", () => ({
  createServer: (handler: unknown) => {
    capture.handler = handler;
    return { listen() {} };
  }
}));

it("ignores malformed Host headers and responds 400 to malformed request URLs", async () => {
  await import("../src/server.js");
  const handler = capture.handler as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  for (const [url, expected] of [["/api/status", 200], ["http://[", 400]] as const) {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    await handler({ method: "GET", url, headers: { host: "[invalid" } } as IncomingMessage, res as unknown as ServerResponse);
    expect(res.writeHead.mock.calls[0]?.[0]).toBe(expected);
    expect(JSON.parse(res.end.mock.calls[0]?.[0])).toHaveProperty(expected === 400 ? "error" : "product");
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  assertReadOnlyMethod,
  readOnlyFlags,
  requireHttpsEndpoint
} from "../src/read-only.js";

test("read-only mode requires all execution flags to remain false", () => {
  const flags = readOnlyFlags({
    APP_MODE: "READ_ONLY",
    LIVE_TRADING: "false",
    TRANSACTION_SIGNING_ENABLED: "false",
    SEND_TRANSACTION_ENABLED: "false",
    SEND_BUNDLE_ENABLED: "false"
  } as NodeJS.ProcessEnv);
  assert.equal(flags.liveTrading, false);
  assert.equal(flags.signing, false);
  assert.equal(flags.transactionSubmission, false);
  assert.equal(flags.bundleSubmission, false);
});

test("missing or enabled execution flags fail closed", () => {
  assert.throws(() => readOnlyFlags({ APP_MODE: "READ_ONLY" } as NodeJS.ProcessEnv));
  assert.throws(() => readOnlyFlags({
    APP_MODE: "READ_ONLY",
    LIVE_TRADING: "true",
    TRANSACTION_SIGNING_ENABLED: "false",
    SEND_TRANSACTION_ENABLED: "false",
    SEND_BUNDLE_ENABLED: "false"
  } as NodeJS.ProcessEnv));
});

test("read-only RPC allowlist permits diagnostics", () => {
  for (const method of ["getHealth", "getGenesisHash", "getSlot", "getAccountInfo", "getTipAccounts"]) {
    assert.doesNotThrow(() => assertReadOnlyMethod(method));
  }
});

test("transaction and bundle submission methods are blocked", () => {
  for (const method of ["sendTransaction", "sendRawTransaction", "sendBundle", "requestAirdrop", "signTransaction"]) {
    assert.throws(() => assertReadOnlyMethod(method), /READ_ONLY_POLICY_BLOCKED_METHOD/);
  }
});

test("endpoints must use TLS", () => {
  assert.equal(requireHttpsEndpoint("https://rpc.example", "RPC").protocol, "https:");
  assert.throws(() => requireHttpsEndpoint("http://rpc.example", "RPC"), /MUST_USE_TLS/);
});

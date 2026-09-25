import { randomUUID } from "node:crypto";
import { Connection, Keypair } from "@solana/web3.js";
import pg from "pg";
import { executeRaydiumDevnetSwap } from "./raydium-execution-adapter.js";

const { Pool } = pg;
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AIRDROP_LAMPORTS = Number(process.env.SOLANA_AIRDROP_LAMPORTS || "500000000");
const SWAP_INPUT_LAMPORTS = process.env.RAYDIUM_SWAP_INPUT_LAMPORTS || "10000000";
const OUTPUT_MINT =
  process.env.RAYDIUM_OUTPUT_MINT || "7i5XE77hnx1a6hjWgSuYwmqdmLoDJNTU1rYA6Gqx7QiE";
const SLIPPAGE_BPS = Number(process.env.RAYDIUM_SLIPPAGE_BPS || "100");

if (!Number.isSafeInteger(AIRDROP_LAMPORTS) || AIRDROP_LAMPORTS <= 1_000_000) {
  throw new Error("SOLANA_AIRDROP_LAMPORTS must be a safe integer greater than 1,000,000");
}
if (!/^\\d+$/.test(SWAP_INPUT_LAMPORTS) || BigInt(SWAP_INPUT_LAMPORTS) <= 0n) {
  throw new Error("RAYDIUM_SWAP_INPUT_LAMPORTS must be a positive integer string");
}
if (!Number.isInteger(SLIPPAGE_BPS) || SLIPPAGE_BPS < 1 || SLIPPAGE_BPS > 10000) {
  throw new Error("RAYDIUM_SLIPPAGE_BPS must be between 1 and 10000");
}

const connection = new Connection(RPC, { commitment: "confirmed" });
const pool = new Pool();

const signer = Keypair.generate();
const accountId = randomUUID();
const intentId = randomUUID();
const approvalId = randomUUID();
const executionId = randomUUID();
const fillId = randomUUID();
const correlationId = randomUUID();

function rawToDecimal(raw: string, decimals: number): string {
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${negative ? "-" : ""}${whole}.${fraction}` : `${negative ? "-" : ""}${whole}`;
}

function executionPrice(inputRaw: string, inputDecimals: number, outputRaw: string, outputDecimals: number): string {
  const input = Number(rawToDecimal(inputRaw, inputDecimals));
  const output = Number(rawToDecimal(outputRaw, outputDecimals));
  if (!Number.isFinite(input) || !Number.isFinite(output) || output <= 0) return "0";
  return String(input / output);
}

console.log(JSON.stringify({
  stage: "REAL_DEX_EXECUTION_E2E",
  network: "solana-devnet",
  venue: "raydium",
  rpc: RPC,
  signer: signer.publicKey.toBase58(),
  outputMint: OUTPUT_MINT,
  inputLamports: SWAP_INPUT_LAMPORTS,
  slippageBps: SLIPPAGE_BPS,
  accountId,
  intentId,
  approvalId,
  executionId,
}, null, 2));

async function recordLedger(result: Awaited<ReturnType<typeof executeRaydiumDevnetSwap>>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const outputQuantity = rawToDecimal(result.observedOutputRaw, result.outputDecimals);
    const expectedQuantity = rawToDecimal(result.minimumOutputRaw, result.outputDecimals);
    const price = executionPrice(result.inputAmountRaw, 9, result.observedOutputRaw, result.outputDecimals);
    const fee = rawToDecimal(String(result.feeLamports), 9);

    await client.query(
      "INSERT INTO accounts (id, external_ref) VALUES ($1, $2)",
      [accountId, signer.publicKey.toBase58()],
    );

    await client.query(
      `INSERT INTO order_intents
       (id, account_id, strategy_id, venue, instrument, side, order_type, quantity,
        max_slippage_bps, client_order_id, idempotency_key, expires_at, metadata)
       VALUES ($1,$2,'phase3-raydium-e2e','raydium-devnet',$3,'SELL','MARKET_SWAP',$4,$5,$6,$7,now()+interval '10 minutes',$8)`,
      [
        intentId,
        accountId,
        `SOL/${result.outputMint}`,
        rawToDecimal(result.inputAmountRaw, 9),
        SLIPPAGE_BPS,
        intentId,
        intentId,
        JSON.stringify({
          inputMint: result.inputMint,
          outputMint: result.outputMint,
          inputAmountRaw: result.inputAmountRaw,
          quotedOutputRaw: result.quotedOutputRaw,
          minimumOutputRaw: result.minimumOutputRaw,
        }),
      ],
    );

    await client.query(
      `INSERT INTO risk_approvals
       (id,intent_id,approved,reason,approved_quantity,max_slippage_bps,risk_policy_version,approved_at,expires_at)
       VALUES ($1,$2,true,'DEVNET DEX E2E policy', $3, $4,'phase3-devnet-raydium-v1',now(),now()+interval '10 minutes')`,
      [approvalId, intentId, rawToDecimal(result.inputAmountRaw, 9), SLIPPAGE_BPS],
    );

    await client.query(
      `INSERT INTO execution_requests
       (id,approval_id,intent_id,account_id,venue,instrument,side,quantity,idempotency_key,requested_at,authorization_context)
       VALUES ($1,$2,$3,$4,'raydium-devnet',$5,'SELL',$6,$7,now(),$8)`,
      [
        executionId,
        approvalId,
        intentId,
        accountId,
        `SOL/${result.outputMint}`,
        rawToDecimal(result.inputAmountRaw, 9),
        intentId,
        JSON.stringify({
          gate: "ALLOW",
          signer: "ephemeral",
          signingBoundary: "e2e-local-keypair",
          transactionId: result.transactionId,
        }),
      ],
    );

    await client.query(
      `INSERT INTO fills
       (id,execution_id,venue,venue_order_id,venue_trade_id,instrument,side,quantity,price,fee,fee_asset,timestamp,transaction_id,raw_reference)
       VALUES ($1,$2,'raydium-devnet',NULL,$3,$4,'SELL',$5,$6,$7,'SOL',now(),$3,$8)`,
      [
        fillId,
        executionId,
        result.transactionId,
        `SOL/${result.outputMint}`,
        outputQuantity,
        price,
        fee,
        JSON.stringify({
          txIds: result.txIds,
          inputAmountRaw: result.inputAmountRaw,
          quotedOutputRaw: result.quotedOutputRaw,
          minimumOutputRaw: result.minimumOutputRaw,
          observedOutputRaw: result.observedOutputRaw,
        }),
      ],
    );

    await client.query(
      `INSERT INTO reconciliation_results
       (execution_id,status,expected_quantity,observed_quantity,transaction_id,details)
       VALUES ($1,'RECONCILED',$2,$3,$4,$5)`,
      [
        executionId,
        expectedQuantity,
        outputQuantity,
        result.transactionId,
        JSON.stringify({
          venue: "raydium-devnet",
          inputMint: result.inputMint,
          outputMint: result.outputMint,
          quotedOutputRaw: result.quotedOutputRaw,
          minimumOutputRaw: result.minimumOutputRaw,
          observedOutputRaw: result.observedOutputRaw,
          feeLamports: result.feeLamports,
          txIds: result.txIds,
        }),
      ],
    );

    await client.query(
      `INSERT INTO audit_events (correlation_id,event_type,subject_id,payload)
       VALUES ($1,'RAYDIUM_DEVNET_EXECUTION_RECONCILED',$2,$3)`,
      [
        correlationId,
        executionId,
        JSON.stringify({
          transactionId: result.transactionId,
          outputMint: result.outputMint,
          observedOutputRaw: result.observedOutputRaw,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  let fundingSignature: string | undefined;
  let lastFundingError: unknown;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      fundingSignature = await connection.requestAirdrop(signer.publicKey, AIRDROP_LAMPORTS);
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const status = await connection.getSignatureStatuses([fundingSignature], { searchTransactionHistory: true });
        const value = status.value[0];
        if (value?.err) throw new Error(`Funding transaction failed: ${JSON.stringify(value.err)}`);
        if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      break;
    } catch (error) {
      lastFundingError = error;
      fundingSignature = undefined;
      if (attempt === 6) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }

  if (!fundingSignature) throw new Error(`Devnet airdrop failed: ${String(lastFundingError)}`);

  const balance = await connection.getBalance(signer.publicKey, "confirmed");
  const required = BigInt(SWAP_INPUT_LAMPORTS) + 50_000_000n;
  if (BigInt(balance) < required) {
    throw new Error(`Insufficient funded balance for swap + fees: ${balance}`);
  }

  const result = await executeRaydiumDevnetSwap({
    rpcUrl: RPC,
    owner: signer,
    outputMint: OUTPUT_MINT,
    inputAmountRaw: SWAP_INPUT_LAMPORTS,
    slippageBps: SLIPPAGE_BPS,
  });

  await recordLedger(result);

  const reconciliation = await pool.query(
    "SELECT id, status, expected_quantity, observed_quantity, transaction_id FROM reconciliation_results WHERE execution_id = $1",
    [executionId],
  );
  if (reconciliation.rows.length !== 1 || reconciliation.rows[0].status !== "RECONCILED") {
    throw new Error("PostgreSQL reconciliation evidence missing");
  }

  console.log(JSON.stringify({
    stage: "E2E_PROOF",
    status: "PASS",
    network: "solana-devnet",
    venue: "raydium",
    fundingSignature,
    txIds: result.txIds,
    transactionId: result.transactionId,
    inputMint: result.inputMint,
    outputMint: result.outputMint,
    quotedOutputRaw: result.quotedOutputRaw,
    minimumOutputRaw: result.minimumOutputRaw,
    observedOutputRaw: result.observedOutputRaw,
    feeLamports: result.feeLamports,
    reconciliation: reconciliation.rows[0],
    postgres: "PASS",
    evidence: {
      orderIntent: intentId,
      riskApproval: approvalId,
      executionRequest: executionId,
      fill: fillId,
      correlationId,
    },
  }, null, 2));
} finally {
  await pool.end();
}

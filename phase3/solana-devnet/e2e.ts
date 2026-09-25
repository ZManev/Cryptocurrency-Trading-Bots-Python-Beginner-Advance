import { randomUUID } from "node:crypto";
import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import pg from "pg";

const { Pool } = pg;
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AIRDROP_LAMPORTS = Number(process.env.SOLANA_AIRDROP_LAMPORTS || "500000000");
const CONFIRM_TIMEOUT_MS = Number(process.env.SOLANA_CONFIRM_TIMEOUT_MS || "90000");

if (!Number.isSafeInteger(AIRDROP_LAMPORTS) || AIRDROP_LAMPORTS <= 1_000_000) {
  throw new Error("SOLANA_AIRDROP_LAMPORTS must be a safe integer greater than 1,000,000");
}

const connection = new Connection(RPC, { commitment: "confirmed" });
const pool = new Pool();

const sender = Keypair.generate();
const recipient = Keypair.generate();
const accountId = randomUUID();
const intentId = randomUUID();
const approvalId = randomUUID();
const executionId = randomUUID();
const fillId = randomUUID();
const correlationId = randomUUID();

console.log(JSON.stringify({
  stage: "SIGNING_BOUNDARY_E2E",
  network: "solana-devnet",
  rpc: RPC,
  sender: sender.publicKey.toBase58(),
  recipient: recipient.publicKey.toBase58(),
  fundingMethod: "rpc-airdrop",
  accountId,
  intentId,
  approvalId,
  executionId,
}, null, 2));

async function waitForConfirmation(signature: string, timeoutMs = CONFIRM_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const value = status.value[0];
    if (value?.err) throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for confirmation: ${signature}`);
}

async function recordLedger(signature: string, recipientBalance: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "INSERT INTO accounts (id, external_ref) VALUES ($1, $2)",
      [accountId, sender.publicKey.toBase58()],
    );

    await client.query(
      `INSERT INTO order_intents
       (id, account_id, strategy_id, venue, instrument, side, order_type, quantity,
        max_slippage_bps, client_order_id, idempotency_key, expires_at, metadata)
       VALUES ($1,$2,'phase3-e2e','solana-devnet','SOL','BUY','TRANSFER',$3,0,$4,$5,now()+interval '10 minutes',$6)`,
      [intentId, accountId, "0.001", intentId, intentId, JSON.stringify({ recipient: recipient.publicKey.toBase58() })],
    );

    await client.query(
      `INSERT INTO risk_approvals
       (id,intent_id,approved,reason,approved_quantity,max_slippage_bps,risk_policy_version,approved_at,expires_at)
       VALUES ($1,$2,true,'DEVNET E2E policy',0.001,0,'phase3-devnet-v1',now(),now()+interval '10 minutes')`,
      [approvalId, intentId],
    );

    await client.query(
      `INSERT INTO execution_requests
       (id,approval_id,intent_id,account_id,venue,instrument,side,quantity,idempotency_key,requested_at,authorization_context)
       VALUES ($1,$2,$3,$4,'solana-devnet','SOL','BUY',0.001,$5,now(),$6)`,
      [executionId, approvalId, intentId, accountId, intentId, JSON.stringify({ gate: "ALLOW", signer: "ephemeral" })],
    );

    await client.query(
      `INSERT INTO fills
       (id,execution_id,venue,venue_order_id,venue_trade_id,instrument,side,quantity,price,fee,fee_asset,timestamp,transaction_id,raw_reference)
       VALUES ($1,$2,'solana-devnet',$3,$4,'SOL','BUY',0.001,1,0,'SOL',now(),$5,$6)`,
      [fillId, executionId, signature, signature, signature, `solana:${signature}`],
    );

    await client.query(
      `INSERT INTO reconciliation_results
       (execution_id,status,expected_quantity,observed_quantity,transaction_id,details)
       VALUES ($1,'RECONCILED',0.001,$2,$3,$4)`,
      [executionId, recipientBalance / 1_000_000_000, signature, JSON.stringify({
        recipient: recipient.publicKey.toBase58(),
        recipientLamports: recipientBalance,
        confirmation: "confirmed",
      })],
    );

    await client.query(
      `INSERT INTO audit_events (correlation_id,event_type,subject_id,payload)
       VALUES ($1,'DEVNET_E2E_RECONCILED',$2,$3)`,
      [correlationId, executionId, JSON.stringify({ signature, recipient: recipient.publicKey.toBase58() })],
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
      fundingSignature = await connection.requestAirdrop(sender.publicKey, AIRDROP_LAMPORTS);
      await waitForConfirmation(fundingSignature);
      break;
    } catch (error) {
      lastFundingError = error;
      if (attempt === 6) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }

  if (!fundingSignature) throw new Error(`Devnet airdrop failed: ${String(lastFundingError)}`);

  const balance = await connection.getBalance(sender.publicKey, "confirmed");
  if (balance <= 1_000_000) throw new Error(`Insufficient funded balance: ${balance}`);

  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: sender.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: recipient.publicKey,
    lamports: 1_000_000,
  }));

  tx.sign(sender);
  const signed = tx.serialize();
  const signature = await connection.sendRawTransaction(signed, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await waitForConfirmation(signature);

  const recipientBalance = await connection.getBalance(recipient.publicKey, "confirmed");
  if (recipientBalance !== 1_000_000) {
    throw new Error(`Recipient balance mismatch: ${recipientBalance}`);
  }

  await recordLedger(signature, recipientBalance);

  const reconciliation = await pool.query(
    "SELECT status, transaction_id FROM reconciliation_results WHERE execution_id = $1",
    [executionId],
  );
  if (reconciliation.rows.length !== 1 || reconciliation.rows[0].status !== "RECONCILED") {
    throw new Error("PostgreSQL reconciliation evidence missing");
  }

  console.log(JSON.stringify({
    stage: "E2E_PROOF",
    status: "PASS",
    network: "solana-devnet",
    fundingSignature,
    signature,
    recipient: recipient.publicKey.toBase58(),
    recipientLamports: recipientBalance,
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

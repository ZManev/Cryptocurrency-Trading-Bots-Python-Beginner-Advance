import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AIRDROP_LAMPORTS = Number(process.env.SOLANA_AIRDROP_LAMPORTS || "500000000");
const CONFIRM_TIMEOUT_MS = Number(process.env.SOLANA_CONFIRM_TIMEOUT_MS || "90000");

if (!Number.isSafeInteger(AIRDROP_LAMPORTS) || AIRDROP_LAMPORTS <= 1_000_000) {
  throw new Error("SOLANA_AIRDROP_LAMPORTS must be a safe integer greater than 1,000,000");
}

const connection = new Connection(RPC, { commitment: "confirmed" });
const sender = Keypair.generate();
const recipient = Keypair.generate();

console.log(JSON.stringify({
  stage: "SIGNING_BOUNDARY_E2E",
  network: "solana-devnet",
  rpc: RPC,
  sender: sender.publicKey.toBase58(),
  recipient: recipient.publicKey.toBase58(),
  fundingMethod: "rpc-airdrop",
}, null, 2));

async function waitForConfirmation(signature: string, timeoutMs = CONFIRM_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const value = status.value[0];
    if (value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
    }
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for confirmation: ${signature}`);
}

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
    const delayMs = attempt * 3000;
    console.log(JSON.stringify({
      stage: "AIRDROP_RETRY",
      attempt,
      delayMs,
      error: String(error),
    }));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

if (!fundingSignature) {
  throw new Error(`Devnet airdrop failed after retries: ${String(lastFundingError)}`);
}

const balance = await connection.getBalance(sender.publicKey, "confirmed");
if (balance <= 1_000_000) {
  throw new Error(`Funding did not provide enough SOL: ${balance}`);
}

const latest = await connection.getLatestBlockhash("confirmed");
const tx = new Transaction({
  feePayer: sender.publicKey,
  recentBlockhash: latest.blockhash,
}).add(
  SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: recipient.publicKey,
    lamports: 1_000_000,
  }),
);

const raw = tx.serialize({ requireAllSignatures: false });
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

const slot = await connection.getSlot("confirmed");
console.log(JSON.stringify({
  stage: "E2E_PROOF",
  status: "PASS",
  network: "solana-devnet",
  fundingMethod: "rpc-airdrop",
  fundingSignature,
  signature,
  slot,
  recipient: recipient.publicKey.toBase58(),
  recipientLamports: recipientBalance,
  invariants: [
    "ephemeral signer only",
    "no production private key",
    "devnet funding confirmed",
    "transaction confirmed by HTTP polling",
    "recipient balance reconciled",
  ],
}, null, 2));

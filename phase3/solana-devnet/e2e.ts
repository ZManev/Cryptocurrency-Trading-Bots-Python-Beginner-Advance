import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const connection = new Connection(RPC, "confirmed");

const sender = Keypair.generate();
const recipient = Keypair.generate();

console.log(JSON.stringify({
  stage: "SIGNING_BOUNDARY_E2E",
  network: "solana-devnet",
  rpc: RPC,
  sender: sender.publicKey.toBase58(),
  recipient: recipient.publicKey.toBase58(),
}, null, 2));

let airdropSignature: string | undefined;
let lastAirdropError: unknown;

for (let attempt = 1; attempt <= 6; attempt += 1) {
  try {
    airdropSignature = await connection.requestAirdrop(
      sender.publicKey,
      0.5 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(airdropSignature, "confirmed");
    break;
  } catch (error) {
    lastAirdropError = error;
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

if (!airdropSignature) {
  throw new Error(`Devnet airdrop failed after retries: ${String(lastAirdropError)}`);
}

const balance = await connection.getBalance(sender.publicKey, "confirmed");
if (balance <= 1_000_000) {
  throw new Error(`Airdrop did not fund ephemeral signer sufficiently: ${balance}`);
}

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: recipient.publicKey,
    lamports: 1_000_000,
  }),
);

const signature = await sendAndConfirmTransaction(connection, tx, [sender], {
  commitment: "confirmed",
});

const recipientBalance = await connection.getBalance(recipient.publicKey, "confirmed");
if (recipientBalance !== 1_000_000) {
  throw new Error(`Recipient balance mismatch: ${recipientBalance}`);
}

const slot = await connection.getSlot("confirmed");
console.log(JSON.stringify({
  stage: "E2E_PROOF",
  status: "PASS",
  network: "solana-devnet",
  airdropSignature,
  signature,
  slot,
  recipient: recipient.publicKey.toBase58(),
  recipientLamports: recipientBalance,
  invariants: [
    "ephemeral signer only",
    "no production private key",
    "airdrop confirmed",
    "transaction confirmed",
    "recipient balance reconciled",
  ],
}, null, 2));

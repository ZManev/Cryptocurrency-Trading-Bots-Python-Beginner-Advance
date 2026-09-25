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

const initial = await connection.requestAirdrop(sender.publicKey, 1 * LAMPORTS_PER_SOL);
await connection.confirmTransaction(initial, "confirmed");

const balance = await connection.getBalance(sender.publicKey);
if (balance <= 0) throw new Error("Airdrop did not fund ephemeral signer");

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

const recipientBalance = await connection.getBalance(recipient.publicKey);
if (recipientBalance !== 1_000_000) {
  throw new Error(`Recipient balance mismatch: ${recipientBalance}`);
}

const slot = await connection.getSlot("confirmed");
console.log(JSON.stringify({
  stage: "E2E_PROOF",
  status: "PASS",
  network: "solana-devnet",
  signature,
  slot,
  recipient: recipient.publicKey.toBase58(),
  recipientLamports: recipientBalance,
  invariants: [
    "ephemeral signer only",
    "no production private key",
    "transaction confirmed",
    "recipient balance reconciled",
  ],
}, null, 2));

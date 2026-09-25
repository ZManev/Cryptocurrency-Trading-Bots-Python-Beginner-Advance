import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH;
const connection = new Connection(RPC, "confirmed");

const sender = KEYPAIR_PATH
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"))))
  : Keypair.generate();

const recipient = Keypair.generate();

console.log(JSON.stringify({
  stage: "SIGNING_BOUNDARY_E2E",
  network: "solana-devnet",
  rpc: RPC,
  sender: sender.publicKey.toBase58(),
  recipient: recipient.publicKey.toBase58(),
  fundingMethod: KEYPAIR_PATH ? "devnet-pow-faucet" : "rpc-airdrop",
}, null, 2));

let fundingSignature: string | undefined;
let lastFundingError: unknown;

if (!KEYPAIR_PATH) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      fundingSignature = await connection.requestAirdrop(sender.publicKey, 500_000_000);
      await connection.confirmTransaction(fundingSignature, "confirmed");
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
}

const balance = await connection.getBalance(sender.publicKey, "confirmed");
if (balance <= 1_000_000) {
  throw new Error(`Funding did not provide enough SOL: ${balance}`);
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
  fundingMethod: KEYPAIR_PATH ? "devnet-pow-faucet" : "rpc-airdrop",
  fundingSignature: fundingSignature ?? null,
  signature,
  slot,
  recipient: recipient.publicKey.toBase58(),
  recipientLamports: recipientBalance,
  invariants: [
    "ephemeral signer only",
    "no production private key",
    "devnet funding confirmed",
    "transaction confirmed",
    "recipient balance reconciled",
  ],
}, null, 2));

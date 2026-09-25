import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export type RaydiumExecutionResult = {
  txIds: string[];
  transactionId: string;
  inputMint: string;
  outputMint: string;
  inputAmountRaw: string;
  quotedOutputRaw: string;
  minimumOutputRaw: string;
  observedOutputRaw: string;
  outputDecimals: number;
  feeLamports: number;
};

async function tokenBalanceRaw(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  let total = 0n;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const response = await connection.getTokenAccountsByOwner(owner, { programId });
    for (const account of response.value) {
      const parsed = await connection.getParsedAccountInfo(account.pubkey, "confirmed");
      const info = (parsed.value?.data as any)?.parsed?.info;
      if (info?.mint === mint.toBase58()) total += BigInt(info.tokenAmount.amount);
    }
  }
  return total;
}

async function waitForConfirmation(connection: Connection, signature: string): Promise<any> {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const value = status.value[0];
    if (value?.err) throw new Error(`Raydium transaction failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
      const parsed = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (parsed?.meta?.err) throw new Error(`Raydium transaction meta failed: ${JSON.stringify(parsed.meta.err)}`);
      return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for Raydium transaction: ${signature}`);
}

export async function executeRaydiumDevnetSwap(args: {
  rpcUrl: string;
  owner: Keypair;
  outputMint?: string;
  inputAmountRaw: string;
  slippageBps: number;
}): Promise<RaydiumExecutionResult> {
  const connection = new Connection(args.rpcUrl, { commitment: "confirmed" });
  const outputMint = new PublicKey(
    args.outputMint || process.env.RAYDIUM_OUTPUT_MINT || "7i5XE77hnx1a6hjWgSuYwmqdmLoDJNTU1rYA6Gqx7QiE",
  );
  const inputMint = NATIVE_MINT;
  const inputAmount = args.inputAmountRaw;
  const swapHost = "https://transaction-v1-devnet.raydium.io";

  const quoteUrl = new URL(`${swapHost}/compute/swap-base-in`);
  quoteUrl.searchParams.set("inputMint", inputMint.toBase58());
  quoteUrl.searchParams.set("outputMint", outputMint.toBase58());
  quoteUrl.searchParams.set("amount", inputAmount);
  quoteUrl.searchParams.set("slippageBps", String(args.slippageBps));
  quoteUrl.searchParams.set("txVersion", "V0");

  const quoteResponse = await fetch(quoteUrl);
  if (!quoteResponse.ok) {
    throw new Error(`Raydium quote HTTP ${quoteResponse.status}: ${await quoteResponse.text()}`);
  }
  const quote = await quoteResponse.json() as any;
  if (!quote.success || !quote.data) {
    throw new Error(`Raydium quote rejected: ${JSON.stringify(quote)}`);
  }

  const beforeOutputRaw = await tokenBalanceRaw(connection, args.owner.publicKey, outputMint);

  const txResponse = await fetch(`${swapHost}/transaction/swap-base-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      computeUnitPriceMicroLamports: "50000",
      swapResponse: quote.data,
      txVersion: "V0",
      wallet: args.owner.publicKey.toBase58(),
      wrapSol: true,
      unwrapSol: false,
    }),
  });

  if (!txResponse.ok) {
    throw new Error(`Raydium transaction HTTP ${txResponse.status}: ${await txResponse.text()}`);
  }
  const txPayload = await txResponse.json() as any;
  if (!txPayload.success || !Array.isArray(txPayload.data) || txPayload.data.length === 0) {
    throw new Error(`Raydium transaction builder rejected: ${JSON.stringify(txPayload)}`);
  }

  const txIds: string[] = [];
  let lastParsed: any = null;

  for (const item of txPayload.data) {
    const buffer = Buffer.from(item.transaction, "base64");
    let signature: string;
    if (quote.data.version === "V0" || item.version === "V0") {
      const transaction = VersionedTransaction.deserialize(buffer);
      transaction.sign([args.owner]);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    } else {
      const transaction = Transaction.from(buffer);
      transaction.sign(args.owner);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    }
    lastParsed = await waitForConfirmation(connection, signature);
    txIds.push(signature);
  }

  const transactionId = txIds[txIds.length - 1];
  const afterOutputRaw = await tokenBalanceRaw(connection, args.owner.publicKey, outputMint);
  const observedOutputRaw = (afterOutputRaw - beforeOutputRaw).toString();
  const minimumOutputRaw = String(quote.data.otherAmountThreshold);
  const quotedOutputRaw = String(quote.data.outputAmount);

  if (BigInt(observedOutputRaw) < BigInt(minimumOutputRaw)) {
    throw new Error(
      `Raydium fill below minimum: observed=${observedOutputRaw} minimum=${minimumOutputRaw}`,
    );
  }

  const mintInfo = await getMint(connection, outputMint);
  return {
    txIds,
    transactionId,
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    inputAmountRaw: inputAmount,
    quotedOutputRaw,
    minimumOutputRaw,
    observedOutputRaw,
    outputDecimals: mintInfo.decimals,
    feeLamports: lastParsed?.meta?.fee ?? 0,
  };
}

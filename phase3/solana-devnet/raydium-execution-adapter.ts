import {
  DEV_API_URLS,
  DEVNET_PROGRAM_ID,
  Raydium,
  Router,
  Token,
  TokenAmount,
  TxVersion,
  toApiV3Token,
  toFeeConfig,
} from "@raydium-io/raydium-sdk-v2";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

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

  const raydium = await Raydium.load({
    owner: args.owner,
    connection,
    cluster: "devnet",
    disableFeatureCheck: true,
    blockhashCommitment: "finalized",
    urlConfigs: {
      ...DEV_API_URLS,
      BASE_HOST: "https://api-v3-devnet.raydium.io",
      OWNER_BASE_HOST: "https://owner-v1-devnet.raydium.io",
      SWAP_HOST: "https://transaction-v1-devnet.raydium.io",
      CPMM_LOCK: "https://dynamic-ipfs-devnet.raydium.io/lock/cpmm/position",
    },
  });

  const inputMint = NATIVE_MINT;
  const inputAmount = args.inputAmountRaw;

  const poolData = await raydium.tradeV2.fetchRoutePoolBasicInfo({
    amm: DEVNET_PROGRAM_ID.AMM_V4,
    clmm: DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID,
    cpmm: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
  });

  const routes = raydium.tradeV2.getAllRoute({
    inputMint,
    outputMint,
    ...poolData,
  });

  const { routePathDict, mintInfos, ammPoolsRpcInfo, ammSimulateCache,
    clmmPoolsRpcInfo, computeClmmPoolInfo, computePoolTickData, computeCpmmData } =
    await raydium.tradeV2.fetchSwapRoutesData({ routes, inputMint, outputMint });

  const inputMintStr = inputMint.toBase58();
  const outputMintStr = outputMint.toBase58();
  const inputInfo = mintInfos[inputMintStr];
  const outputInfo = mintInfos[outputMintStr];
  if (!inputInfo || !outputInfo) throw new Error("Raydium route is missing mint metadata");

  const swapRoutes = raydium.tradeV2.getAllRouteComputeAmountOut({
    inputTokenAmount: new TokenAmount(
      new Token({
        mint: inputMintStr,
        decimals: inputInfo.decimals,
        isToken2022: inputInfo.programId.equals(TOKEN_2022_PROGRAM_ID),
      }),
      inputAmount,
    ),
    directPath: routes.directPath.map(
      (p) =>
        ammSimulateCache[p.id.toBase58()] ||
        computeClmmPoolInfo[p.id.toBase58()] ||
        computeCpmmData[p.id.toBase58()],
    ),
    routePathDict,
    simulateCache: ammSimulateCache,
    tickCache: computePoolTickData,
    mintInfos,
    outputToken: toApiV3Token({
      ...outputInfo,
      programId: outputInfo.programId.toBase58(),
      address: outputMintStr,
      freezeAuthority: undefined,
      mintAuthority: undefined,
      extensions: {
        feeConfig: toFeeConfig(outputInfo.feeConfig),
      },
    }),
    chainTime: Math.floor(raydium.chainTimeData?.chainTime ?? Date.now() / 1000),
    slippage: args.slippageBps / 10000,
    epochInfo: await connection.getEpochInfo(),
    blockTimestamp: Math.floor(Date.now() / 1000),
  });

  const targetRoute = swapRoutes[0];
  if (!targetRoute) throw new Error(`No Raydium Devnet route for SOL -> ${outputMintStr}`);

  const minimumOutputRaw = targetRoute.minAmountOut.amount.raw.toString();
  const quotedOutputRaw = targetRoute.amountOut.amount.raw.toString();
  const beforeOutputRaw = await tokenBalanceRaw(connection, args.owner.publicKey, outputMint);

  const poolKeys = await raydium.tradeV2.computePoolToPoolKeys({
    pools: targetRoute.poolInfoList,
    ammRpcData: ammPoolsRpcInfo,
    clmmRpcData: clmmPoolsRpcInfo,
  });

  const { execute } = await raydium.tradeV2.swap({
    routeProgram: Router,
    txVersion: TxVersion.V0,
    swapInfo: targetRoute,
    swapPoolKeys: poolKeys,
    ownerInfo: {
      associatedOnly: true,
      checkCreateATAOwner: true,
    },
    computeBudgetConfig: {
      units: 600000,
      microLamports: 465915,
    },
  });

  const { txIds } = await execute({ sequentially: true });
  if (!txIds.length) throw new Error("Raydium execution returned no transaction IDs");

  const transactionId = txIds[txIds.length - 1];
  const deadline = Date.now() + 90000;
  let parsed: any = null;
  while (Date.now() < deadline) {
    parsed = await connection.getParsedTransaction(transactionId, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (parsed) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!parsed) throw new Error(`Unable to fetch confirmed Raydium transaction: ${transactionId}`);
  if (parsed.meta?.err) throw new Error(`Raydium transaction failed: ${JSON.stringify(parsed.meta.err)}`);

  const afterOutputRaw = await tokenBalanceRaw(connection, args.owner.publicKey, outputMint);
  const observedOutputRaw = (afterOutputRaw - beforeOutputRaw).toString();
  if (BigInt(observedOutputRaw) < BigInt(minimumOutputRaw)) {
    throw new Error(
      `Raydium fill below minimum: observed=${observedOutputRaw} minimum=${minimumOutputRaw}`,
    );
  }

  const mintInfo = await getMint(connection, outputMint);
  return {
    txIds,
    transactionId,
    inputMint: inputMintStr,
    outputMint: outputMintStr,
    inputAmountRaw: inputAmount,
    quotedOutputRaw,
    minimumOutputRaw,
    observedOutputRaw,
    outputDecimals: mintInfo.decimals,
    feeLamports: parsed.meta?.fee ?? 0,
  };
}

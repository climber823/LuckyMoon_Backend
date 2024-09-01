import { ethers } from "ethers";
import {
  wssProvider,
  IERC20,
  uniswapV2Pair,
  CONTRACTS,
  TOKENS,
} from "./src/constants.js";
import IERC20ABI from "./src/abi/IERC20.js";
import IUniswapV2Pair from "./src/abi/IUniswapV2Pair.js";
// import IUniswapV2Router02 from "./src/abi/IUniswapV2Router02.js";
import IUniswapV2Factory from "./src/abi/IUniswapV2Factory.js";
import ITeamFinanceLock from "./src/abi/ITeamFinance.js";
import IUnicrypt from "./src/abi/IUnicrypt.js";
import IPinkLock from "./src/abi/IPinkLock.js";
import { createRequire } from "module";
import {
  requestSimulationForNewContract,
  getVerifiedContract,
} from "./src/simulationAndVerify.js";

const require = createRequire(import.meta.url);
const abiDecoder = require("abi-decoder");
import { match, getBigNumberFromString } from "./src/utils.js";
import tokenStructure from "./models/tokens.js";
import sniperTxsStructure from "./models/sniperTxs.js";
import testSnipers from "./models/testSnipers.js";
import { io } from "./global/socketIO.js";
import { getUniv2PairAddress } from "./src/univ2.js";
import axios from "axios";
import { logSuccess } from "./src/logging.js";
import { MEV_MIN_COUNT, MEV_SEARCH_STEP } from "./src/constants.js";
import limitTokens from "./models/limitTokens.js";

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);

// Analyze the log of the transaction. Mainly find swap methods.
const detectPairCreate = async (parameters) => {
  const { decodedLogs, txHash } = parameters;

  for (const decodedLog of decodedLogs) {
    if (
      decodedLog.name == "PairCreated" &&
      match(decodedLog.address, CONTRACTS.UNIV2_FACTORY)
    ) {
      const token0 = decodedLog.events[0].value;
      const token1 = decodedLog.events[1].value;
      const pair = decodedLog.events[2].value;

      // We detect only WETH pair now
      if (!match(token0, TOKENS.WETH) && !match(token1, TOKENS.WETH)) continue;

      const tokenAddress = match(token0, TOKENS.WETH)
        ? token1.toLowerCase()
        : token0.toLowerCase();

      console.log("We detect WETH pair create.", {
        address: tokenAddress,
        pair: pair.toLowerCase(),
      });

      try {
        await limitTokens.create({
          address: tokenAddress,
          pair: pair.toLowerCase(),
        })
      } catch(e) {
        return;
      }
    }
  }
};

// Analyze the log of the transaction. Mainly find swap methods.
const detectSwapLogs = async (parameters) => {
  const { decodedLogs, tx, blockNumber } = parameters;

  let tradeTokenAmount = -1; // Trade amount of token
  let tokenReserve;
  let ratio = -1.0;
  let tokenCheck;
      
  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Swap") {
      const pair = decodedLog.address.toLowerCase();

      const amount0Out = decodedLog.events[3].value;
      const amount1Out = decodedLog.events[4].value;
     
      let token0, token1;
      try {
        // If the pair is uniswap v2 pair
        token0 = await uniswapV2Pair.attach(pair).token0();
        token1 = await uniswapV2Pair.attach(pair).token1();
        if (
          pair !==
          getUniv2PairAddress({ tokenA: token0, tokenB: token1 }).toLowerCase()
        )
          return;
      } catch (e) {
        return;
      }

      let swapDirection; // 0: WETH -> TOKEN(BUY), 1: TOKEN -> WETH(SELL)
      if (amount1Out == "0") {
        swapDirection = match(token0, TOKENS.WETH) ? 1 : 0;
      } else {
        swapDirection = match(token0, TOKENS.WETH) ? 0 : 1;
      }

      if(swapDirection == 1) return;

      
      tokenCheck = await limitTokens.findOne({ pair });

      if (tokenCheck == null) return;
      
      if (tokenCheck.openTrading) return;
      tokenCheck.openTrading = true;
      tradeTokenAmount = amount0Out != "0" ? amount0Out : amount1Out;
    }
    else if (decodedLog.name == 'Sync') {
      const reserve0 = decodedLog.events[0].value;
      const reserve1 = decodedLog.events[1].value;

      const pair = decodedLog.address.toLowerCase();

      let token0, token1;
      try {
        token0 = await uniswapV2Pair.attach(pair).token0();
        token1 = await uniswapV2Pair.attach(pair).token1();
       } catch (e) {
        return;
      }

      tokenReserve = match(token0, TOKENS.WETH) ? reserve1: reserve0
    }
  }

  if(tradeTokenAmount == -1) return;

  tokenReserve = parseFloat(tokenReserve) + parseFloat(tradeTokenAmount);
  ratio = parseFloat(tradeTokenAmount) / parseFloat(tokenReserve) * 100.0;
  if(ratio < 0.6) {
    tokenCheck.firstSwapBlockNumber = blockNumber
    tokenCheck.limit = true;
    tokenCheck.save()
    return
  } 
  
  tokenCheck.save()
  return;
};
  
const doWhatBlockRecvNeed = async (block, blockNumber) => {
  const txs = block.transactions;
  
  for (const tx of txs) {
    const txReceipt = await wssProvider.getTransactionReceipt(tx.hash);
    try {
      // Ignore failed transaction
      if (txReceipt.status == 0) continue;

      let decodedLogs = [];
      try {
        decodedLogs = abiDecoder.decodeLogs(txReceipt.logs);
      } catch (e) {
        continue;
      }
    
      // Analyze the logs for Pair create
      await detectPairCreate({
        decodedLogs,
        txHash: txReceipt.transactionHash,
      });

      // Analyze the logs for swap
      await detectSwapLogs({
        decodedLogs,
        tx: txReceipt,
        blockNumber: blockNumber,
      });
    } catch (e) {
      console.log("Error:", {txReceipt}, e);
      continue
    }
  }
};

export const FindLimit = async () => {
  //console.log("test", await isSwapEventPast("0xc8a5045f80573f8a33e7c97d5482a200154ff084", 19768469))
  let startBlock = 19500000;
  let endBlock = 19600000;

  // try {
  //   await limitTokens.create({
  //     address: "0x3d1c949a761c11e4cc50c3ae6bdb0f24fd7a39da",
  //     pair: "0x3663f65ae500cec33ae54468741e5c10a30d1d1e"
  //   })
  // } catch(e) {
    
  // }

  
  for(let i = startBlock; i <= endBlock; ++ i) {
  // for(let i = 19789253; i < 19789253 + 1; ++ i) {
    await doWhatBlockRecvNeed(await wssProvider.getBlockWithTransactions(i), i);
    if(i % 1000 == 0) console.log("you are now here---", i, new Date().toISOString() )
  }
  console.log("done")
  // let prevoiusBlock = 0;
  // wssProvider.on("block", async (blk) => {
  //   if (prevoiusBlock >= blk) return;
  //   if(!isDoneSyncing) return;
  //   prevoiusBlock = blk;
  //   // requestSimulationForNewContract(blk);
  //   // getVerifiedContract(blk);
  //   // const blkReceiveTime = Date.now() / 1000;
  //   try {
  //     const block = await wssProvider.getBlockWithTransactions(blk);
  //     // console.log(
  //     //   block.number,
  //     //   block.timestamp,
  //     //   blkReceiveTime,
  //     //   block.timestamp - blkReceiveTime
  //     // );
  //     step = doWhatBlockRecvNeed(block, blk);
  //     prevoiusBlock = blk + step - 1;
  //   } catch (e) {
  //     console.log("Error", e);
  //   }
  // });
};

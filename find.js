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

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);

// Analyze the log of the transaction. Mainly find mev swap methods.
const detectSnipedLogs = async (parameters) => {
  const { decodedLogs, tx } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Swap") {
      const pair = decodedLog.address.toLowerCase();
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
          return {
            status: "empty"
          };
      } catch (e) {
        return {
          status: "empty"
        };
      }

      let swapDirection; // 0: WETH -> TOKEN(BUY), 1: TOKEN -> WETH(SELL)
      if (amount1Out == "0") {
        swapDirection = match(token0, TOKENS.WETH) ? 1 : 0;
      } else {
        swapDirection = match(token0, TOKENS.WETH) ? 0 : 1;
      }
      
      if(swapDirection == 0) return {
        status: "buy",
        pair: pair,
      };
      return {
        status: "sell",
        pair: pair,
      }
    }
  }

  return {
    status: "empty"
  }
};

const isSwapEventPast = async (pair, blockNumber) => {
  const contract        = new ethers.Contract(pair, IUniswapV2Pair, wssProvider);

  const swapEventFilter = contract.filters.Swap();

  const fromBlock       = blockNumber - MEV_SEARCH_STEP;
  const toBlock         = blockNumber - 1;

  try {
    const swapEvents = await contract.queryFilter(swapEventFilter, fromBlock, toBlock);
    if(swapEvents.length > 0) return true;
    return false;
    // for (const event of swapEvents) {
    //     console.log(`Swap detected! Transaction Hash: ${event.transactionHash}`);
    //     console.log(event.args); // This shows all the arguments from the event
    // }
  } catch (error) {
      return false;
  }

}
  
const doWhatBlockRecvNeed = async (block, blockNumber) => {
  const txs = block.transactions;
  
  let mevBuy = {}, mevSell = {}
  for (const tx of txs) {
    const txReceipt = await wssProvider.getTransactionReceipt(tx.hash);
    try {
      if (txReceipt.status == 0) continue;

      let decodedLogs = [];
      try {
        decodedLogs = abiDecoder.decodeLogs(txReceipt.logs);
      } catch (e) {
        continue;
      }
      let ret = await detectSnipedLogs({
        decodedLogs,
        tx: txReceipt,
      })
      
      switch(ret.status) {
        case "buy":
          if(mevBuy.hasOwnProperty(ret.pair)) mevBuy[ret.pair] ++;
          else mevBuy[ret.pair]  = 1;
        break;

        case "sell":
          if(mevSell.hasOwnProperty(ret.pair)) mevSell[ret.pair] ++;
          else mevSell[ret.pair]  = 1;
        break;
      }
    } catch (e) {
      console.log("Error:", {txReceipt}, e);
    }
  }
  for (let pair in mevBuy) {

    if (!mevBuy.hasOwnProperty(pair)) continue;
    if (mevBuy[pair] < MEV_MIN_COUNT) continue;
    // isSwapEventPast means is this sniper attack?
    if (await isSwapEventPast(pair, blockNumber)) continue;
    console.log("More than 80 sniper attack!!!---", blockNumber, pair, mevBuy[pair])
    try {
      const newTestSniper = await testSnipers.create({
        pair: pair.toLowerCase(),
        blockNumber: blockNumber,
        sniperCount: mevBuy[pair]
      });
      newTestSniper.save()
    } catch (e) {
      continue;
    }
  }
};

export const find = async () => {
  //console.log("test", await isSwapEventPast("0xc8a5045f80573f8a33e7c97d5482a200154ff084", 19768469))
  let startBlock = 19500000;
  let endBlock = 19600000;
  for(let i = startBlock; i < endBlock; ++ i) {
  // for(let i = 19789253; i < 19789253 + 1; ++ i) {
    await doWhatBlockRecvNeed(await wssProvider.getBlockWithTransactions(i), i);
    if(i % 1000 == 0) console.log("you are now here---", i, new Date().toISOString() )
  }
  // console.log("done")
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

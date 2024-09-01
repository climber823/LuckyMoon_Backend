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
import syncBlock from "./models/syncBlock.js";
import { io } from "./global/socketIO.js";
import { getUniv2PairAddress } from "./src/univ2.js";
import axios from "axios";
import { logSuccess } from "./src/logging.js";

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);

// Handle detect ERC20 token creation
const detectForContractCreation = async (parameters) => {
  const { txReceipt } = parameters;
  const contractAddress = txReceipt.contractAddress;

  // Get name, symbol, totalSupply, decimals of the contract. If these things are exist, this contract is token contract.
  let name, symbol, totalSupply, decimals;

  try {
    name = await IERC20.attach(contractAddress).name();
    symbol = await IERC20.attach(contractAddress).symbol();
    totalSupply = await IERC20.attach(contractAddress).totalSupply();
    decimals = await IERC20.attach(contractAddress).decimals();

    // Check if the contract is NFT: NFT's decimal is ZERO
    if (decimals == 0) return;

    let owner;
    try {
      owner = await IERC20.owner();
    } catch (e) {
      try {
        owner = await IERC20.getOwner();
      } catch (e) {
        owner = txReceipt.from;
      }
    }

    const newTokenStructure = await tokenStructure.create({
      address: contractAddress.toLowerCase(),
      name,
      symbol,
      decimals,
      owner,
      totalSupply,
      tokenCreationHash: txReceipt.transactionHash,
      blockNumber: txReceipt.blockNumber,
    });

  } catch (e) {
    // This contract is not ERC20 token contract.
    return;
  }
};

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

      await tokenStructure.create({
          address: tokenAddress,
          pair: pair.toLowerCase(),
          pairToken: TOKENS.WETH,
        }
      );
    }
  }
};

// Analyze the log of the transaction. Mainly find swap methods.
const detectSwapLogs = async (parameters) => {
  const { decodedLogs, tx, blockNumber } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Swap") {
      const pair = decodedLog.address.toLowerCase();

      // const sender = decodedLog.events[0].value;
      const amount0In = decodedLog.events[1].value;
      const amount1In = decodedLog.events[2].value;
      const amount0Out = decodedLog.events[3].value;
      const amount1Out = decodedLog.events[4].value;
      // const to = decodedLog.events[5].value;

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

      if(swapDirection == 1) return

      // const token = match(token0, TOKENS.WETH) ? token1 : token0; // current token;

      let tradeTokenAmount; // Trade amount of token
      if (swapDirection == 0) {
        tradeTokenAmount = amount0Out != "0" ? amount0Out : amount1Out;
      } else {
        tradeTokenAmount = amount0In != "0" ? amount0In : amount1In;
      }

      const tokenStructureInfoForCheck = await tokenStructure.findOne({ pair });
      if (tokenStructureInfoForCheck == null) continue;

      if (tokenStructureInfoForCheck.buyCount == undefined) {
        tokenStructureInfoForCheck.buyCount = swapDirection == 0 ? 1 : 0;
        tokenStructureInfoForCheck.sellCount = swapDirection == 1 ? 1 : 0;
        tokenStructureInfoForCheck.firstBlockBuyCount =
          swapDirection == 0 ? 1 : 0;
        tokenStructureInfoForCheck.firstBlockSellCount =
          swapDirection == 1 ? 1 : 0;
        tokenStructureInfoForCheck.maxTradeTokenAmount = tradeTokenAmount;
        tokenStructureInfoForCheck.firstSwapBlockNumber = blockNumber;
        await tokenStructureInfoForCheck.save();
      } 
      return;
    }
  }
};

const detectTeamFinanceLock = async (parameters) => {
  const { txReceipt } = parameters;

  const decodedLogsForTeamFinance = abiDecoder.decodeLogs(txReceipt.logs);
  for (const decodedLog of decodedLogsForTeamFinance) {
    if (decodedLog.name == "Deposit") {
      // const id = decodedLog.events[0].value;
      const tokenAddress = decodedLog.events[1].value;
      // const withdrawalAddress = decodedLog.events[2].value;
      const amount = ethers.BigNumber.from(decodedLog.events[3].value);
      const unlockTime = decodedLog.events[4].value;
      return { token: tokenAddress, amount, unlockTime };
    }
  }
  return null;
};

const detectUnicryptLock = async (parameters) => {
  const { txReceipt } = parameters;

  const decodedLogsForUnicrypt = abiDecoder.decodeLogs(txReceipt.logs);

  for (const decodedLog of decodedLogsForUnicrypt) {
    if (decodedLog.name == "onDeposit") {
      const lpToken = decodedLog.events[0].value;
      // const user = decodedLog.events[1].value;
      const amount = ethers.BigNumber.from(decodedLog.events[2].value);
      // const lockDate = decodedLog.events[3].value;
      const unlockDate = decodedLog.events[4].value;
      return { token: lpToken, amount, unlockTime: unlockDate };
    }
  }
  return null;
};

const detectPinkLock = async (parameters) => {
  const { txReceipt } = parameters;

  for (const txLog of txReceipt.logs) {
    if (
      txLog.topics[0] ==
      "0x694af1cc8727cdd0afbdd53d9b87b69248bd490224e9dd090e788546506e076f"
    ) {
      // Lock added
      const token = "0x" + txLog.data.slice(26, 66);
      const amount = ethers.BigNumber.from("0x" + txLog.data.slice(130, 194));
      const unlockDate = ethers.BigNumber.from(
        "0x" + txLog.data.slice(194, 258)
      ).toNumber();
      return { token, amount, unlockTime: unlockDate };
    }
  }
  return null;
};

const detectLock = async (parameters) => {
  const { txReceipt } = parameters;

  let token, amount, unlockTime;
  // Start Detect for Team finance
  if (match(txReceipt.to, "0xe2fe530c047f2d85298b07d9333c05737f1435fb")) {
    const returnParameters = await detectTeamFinanceLock({ txReceipt });
    if (returnParameters == null) return;
    ({ token, amount, unlockTime } = returnParameters);
  }

  // Start Detect for Unicrypt
  else if (match(txReceipt.to, "0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214")) {
    const returnParameters = await detectUnicryptLock({ txReceipt });
    if (returnParameters == null) return;
    ({ token, amount, unlockTime } = returnParameters);
  }

  // Start Detect for Pink lock
  else if (match(txReceipt.to, "0x71B5759d73262FBb223956913ecF4ecC51057641")) {
    const returnParameters = await detectPinkLock({ txReceipt });
    if (returnParameters == null) return;
    ({ token, amount, unlockTime } = returnParameters);
  }

  // Start Detect for lp to transfer dead wallet
  else {
    let tokenStructureInfoForCheck = await tokenStructure.findOne({
      pair: txReceipt.to.toLowerCase(),
    });
    if (tokenStructureInfoForCheck != null) {
      let decodedLogs = [];
      try {
        decodedLogs = abiDecoder.decodeLogs(txReceipt.logs);
      } catch (e) {
        return;
      }
      for (const decodedLog of decodedLogs) {
        if (decodedLog.name == "Transfer") {
          // const from = decodedLog.events[0].value;
          const to = decodedLog.events[1].value;
          const value = decodedLog.events[2].value;
          if (match(to, CONTRACTS.DEAD) || match(to, CONTRACTS.DEAD2)) {
            tokenStructureInfoForCheck.liquidityLockedAmount =
              getBigNumberFromString(value);
            tokenStructureInfoForCheck.liquidityUnlockTime = 10000000000000;
            tokenStructureInfoForCheck.liquidityLockedHash =
              txReceipt.transactionHash;
            tokenStructureInfoForCheck.liquidityLockedBuyCount = tokenStructureInfoForCheck.buyCount;
            tokenStructureInfoForCheck.liquidityLockedSellCount = tokenStructureInfoForCheck.sellCount;
            await tokenStructureInfoForCheck.save();

             return;
          }
        }
      }
    } else return;
  }

  if (token === undefined) return;

  let tokenStructureInfoForCheck = await tokenStructure.findOne({
    pair: token,
  });
  if (tokenStructureInfoForCheck != null) {
    tokenStructureInfoForCheck.liquidityLockedAmount = amount;
    tokenStructureInfoForCheck.liquidityUnlockTime = unlockTime;
    tokenStructureInfoForCheck.liquidityLockedHash = txReceipt.transactionHash;
    tokenStructureInfoForCheck.liquidityLockedBuyCount = tokenStructureInfoForCheck.buyCount;
    tokenStructureInfoForCheck.liquidityLockedSellCount = tokenStructureInfoForCheck.sellCount;
    await tokenStructureInfoForCheck.save();
  }
  tokenStructureInfoForCheck = await tokenStructure.findOne({
    address: token,
  });
  if (tokenStructureInfoForCheck != null) {
    tokenStructureInfoForCheck.tokenLockedAmount = amount;
    tokenStructureInfoForCheck.tokenUnlockTime = unlockTime;
    tokenStructureInfoForCheck.tokenLockedHash = txReceipt.transactionHash;
    await tokenStructureInfoForCheck.save();
  }
};

const doWhatBlockRecvNeed = async (blockNumber, block) => {
  const txs = block.transactions;

  for (const tx of txs) {
    const txReceipt = await wssProvider.getTransactionReceipt(tx.hash);
    try {
      // Ignore failed transaction
      if (txReceipt.status == 0) continue;

      // Detect for contract creation
      if (txReceipt.to == null && txReceipt.contractAddress != null) {
        // Analyze new contract is created
        // await detectForContractCreation({ txReceipt });
      } else {
        // Analyze the logs for lock
        await detectLock({ txReceipt });

        // Analyze the transaction for remove limits
        // await detectRemoveLimits({ tx });
      }
      // Analyze the transaction for remove limits
      // await detectRenounceOwnerShip({ tx });

      let decodedLogs = [];
      try {
        decodedLogs = abiDecoder.decodeLogs(txReceipt.logs);
      } catch (e) {
        continue;
      }
      // Analyze the token mint
      // await detectForTokenMint({
      //   decodedLogs,
      //   txHash: txReceipt.transactionHash,
      // });

      // Analyze the logs for Pair create
      // await detectPairCreate({
      //   decodedLogs,
      //   txHash: txReceipt.transactionHash,
      // });

      // Analyze the logs for add liquidity
      // await detectAddLiquidity({
      //   decodedLogs,
      //   txHash: txReceipt.transactionHash,
      // });

      // Analyze the logs for remove liquidity
      // await detectRemoveLiquidity({
      //   decodedLogs,
      //   txHash: txReceipt.transactionHash,
      // });

      // Detect for the lp token burn. Will remove by remove liquidity or send it to the ZERO wallet.
      // await detectForRemoveLPToken({
      //   decodedLogs,
      //   txHash: txReceipt.transactionHash,
      // });

      // Analyze the logs for swap
      await detectSwapLogs({
        decodedLogs,
        tx: txReceipt,
        blockNumber: txReceipt.blockNumber,
      });
    } catch (e) {
      // console.log("Error:", {txReceipt}, e);
      continue
    }
  }
};


// Be careful to use this because this function updated main database document-tokenstructure
export const findLockBeforeSwap = async () => {
  let lastBlock =  [ 19633343, 19519993, 19526106, 19528230, 19590879]
  
  // for(let i = 0; i < 5; ++ i) {
  //   console.log("you are here", i)
  //   for (let j = lastBlock[i] - 1000; j <= lastBlock[i]; ++ j) {
  //     await doWhatBlockRecvNeed(j, await wssProvider.getBlockWithTransactions(j));
  //   }   
  // }
  logSuccess("Done");
}; 
// 19612663 19626278 19632843 19633343 19640024 19513156 19513717 19519127 19519993 19526106 
// 19528230 19555213 19562620 19569844 19576892 19583744 19583864 19590009 19590879 19592877
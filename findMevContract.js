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
import attack1Tokens from "./models/attack1Tokens.js";
import { getUniv2DataGivenOut } from "./src/univ2.js";
import { token } from "morgan";
import { getInternalTxns } from "./controllers/contractInfo.js";
import { getBlockTimestamp } from "./src/constants.js";
import mevTokens from "./models/mevTokens.js";
import { isContractVerified } from "./src/utils.js";

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);



// Tanaka!!@!@!@!@!@!----------------------------------------------------------------

const ANALYZE_BLOCK_COUNT = 100;

let pendingTxHashes = {}
  
const removeOldPendingTxHashes = (block) => {
  for (const txHash in pendingTxHashes) {
    if (pendingTxHashes[txHash].blockNumber < block) {
      delete pendingTxHashes[txHash];
    }
  }
}

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

    await mevTokens.create({
      address: contractAddress.toLowerCase(),
      name,
      symbol,
      decimals,
      owner: owner.toLowerCase(),
      totalSupply,
      tokenCreationHash: txReceipt.transactionHash,
      blockNumberWhenCreated: txReceipt.blockNumber,
    });

    console.log("We detect new ERC20 token creation on MEV Block", {
      address: contractAddress.toLowerCase(),
      name,
      symbol,
      decimals,
      owner,
      totalSupply,
      tokenCreationHash: txReceipt.transactionHash,
      blockNumberWhenCreated: txReceipt.blockNumber,
      hash: txReceipt.transactionHash,
    });

  } catch (e) {
    // This contract is not ERC20 token contract.
    // console.log("This contract is not ERC20 token contract.", e.message)
    return;
  }
};

//Analyze the log for the token mint.
const detectForTokenMint = async (parameters) => {
  const { decodedLogs, txHash, blockNumber, status } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Transfer") {
      const contract = decodedLog.address.toLowerCase();
      const from = decodedLog.events[0].value.toLowerCase();
      const to = decodedLog.events[1].value.toLowerCase();
      const value = decodedLog.events[2].value;

      const mevTokenCheck = await mevTokens.findOne({
        address: contract,
      });

      if(mevTokenCheck == null) continue

      if (match(from, CONTRACTS.DEAD) && match(to, mevTokenCheck.owner) && mevTokenCheck.tokenMintHash == null) {
        await mevTokens.findOneAndUpdate(
          {
            address: contract,
          },
          {
            mintedAmount: getBigNumberFromString(value),
            tokenMintHash: txHash,
            verifiedWhenCreated: await isContractVerified(contract),
            blockNumberWhenCreated: blockNumber,
            statusWhereCreated: status,
          },
          {}
        );

        console.log("Contract Creation Mint", {
          token: contract,
          txHash: txHash,
        });
        continue
      }

      if(mevTokenCheck.tokenMintHash == null) continue; 

      if (match(from, mevTokenCheck.owner) && match(to, contract) && mevTokenCheck.transferTokenHash == null) {
        await mevTokens.findOneAndUpdate(
          {
            address: contract,
          },
          {
            transferTokenAmount: getBigNumberFromString(value),
            transferTokenHash: txHash,
            verifiedWhenTransferToken: await isContractVerified(contract),
            blockNumberWhenTokenTransfer: blockNumber,
            statusWhereTokenTransfer: status,
          },
          {}
        );
        console.log("Token Transfer", {
          token: contract,
          txHash: txHash,
        });
        continue
      }

      if(mevTokenCheck.transferTokenHash == null) continue; 

      const pair = getUniv2PairAddress({ tokenA: contract, tokenB: TOKENS.WETH })

      if (match(from, contract) && match(to, pair) && mevTokenCheck.openTradingHash == null) {
        await mevTokens.findOneAndUpdate(
          {
            address: contract,
          },
          {
            openTradingTokenAmount: getBigNumberFromString(value),
            openTradingHash: txHash,
            verifiedWhenOpenTrading: await isContractVerified(contract),
            blockNumberWhenOpenTrading: blockNumber,
            blockCountFromTokenCreate: blockNumber - mevTokenCheck.blockNumberWhenCreated,
            blockCountFromTokenTransfer: blockNumber - mevTokenCheck.blockNumberWhenTokenTransfer,
            statusWhereOpenTrading: status,
            pair: pair.toLowerCase(),
          },
          {}
        );

        console.log("Open Trading", {
          token: contract,
          txHash: txHash,
        });
        continue
      }
    }
  }
};

// Analyze the log of the transaction. Mainly find swap methods.
const detectSwapLogs = async (parameters) => {
  const { decodedLogs, tx, blockNumber } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Swap") {
      const pair = decodedLog.address.toLowerCase();

      const token = await mevTokens.findOne({ pair });
      
      if (token == null) continue;
      if (token.firstSwapBlockNumber != null) continue;

      token.firstSwapBlockNumber = blockNumber
      token.blockCountBetweenOpenTradingAndFirstSwap = blockNumber - token.blockNumberWhenOpenTrading
      console.log("First Swap")
      await token.save()
      return;
    }
  }
};

const doWhatBlockRecvNeed = async (blockNumber, block) => {
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

      // Detect for contract creation
      if (txReceipt.to == null && txReceipt.contractAddress != null && !pendingTxHashes.hasOwnProperty(txReceipt.transactionHash)) {
        // Analyze new contract is created
        await detectForContractCreation({ txReceipt });
      }

      // Analyze the token mint
      await detectForTokenMint({
        decodedLogs,
        txHash: txReceipt.transactionHash,
        blockNumber: blockNumber,
        status: pendingTxHashes.hasOwnProperty(txReceipt.transactionHash) ? "Mempool" : "MEV"
      });

      // Detect for swap logs
      await detectSwapLogs({
        decodedLogs,
        tx: txReceipt,
        blockNumber: txReceipt.blockNumber,
      });

    } catch (e) {
      console.log("Error:", {txReceipt}, e);
      continue
    }
  }
};

const test = async () => {
  const blk = await wssProvider.getBlockWithTransactions(20065083);
  await doWhatBlockRecvNeed(20065083, blk)
  console.log("done")
}

export const findMevContract = async () => {
  let curBlockNumber = await wssProvider.getBlockNumber();
  wssProvider.on("pending", (txHash) => {
    pendingTxHashes[txHash] = {
      blockNumber: curBlockNumber
    }
  });

  // await test()
  // return

  wssProvider.on("block", async (block) => {
    if(curBlockNumber >= block) return
    curBlockNumber = block;

    // Analyze block
    try {
      const blk = await wssProvider.getBlockWithTransactions(block);
      await doWhatBlockRecvNeed(block, blk)
  
      // Delete old pending transaction hashes
      if (block % ANALYZE_BLOCK_COUNT == 0) removeOldPendingTxHashes(block - ANALYZE_BLOCK_COUNT)
      console.log(block, Object.keys(pendingTxHashes).length)
    } catch (e) {
      console.log("Error:", e)
    }
  });
};

// findMevContract()
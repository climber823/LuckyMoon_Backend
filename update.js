import { ethers } from "ethers";
import {
  wssProvider,
  IERC20,
  uniswapV2Pair,
  CONTRACTS,
  TOKENS,
  MAX_NUMBER,
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
import { io } from "./global/socketIO.js";
import { getUniv2PairAddress } from "./src/univ2.js";
import axios from "axios";
import { logSuccess } from "./src/logging.js";
import { getFilteredTokens, getLatestTokens, getNeedUpdateTokens } from "./controllers/contractInfo.js";
import { getReservesFromTransaction } from "./controllers/contractInfo.js";
import { getInternalTxns } from "./controllers/contractInfo.js";
import { getBlockTimestamp } from "./src/constants.js";

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);

const FIRST_TX_COUNT = 5

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

    console.log("We detect new ERC20 token creation", {
      address: contractAddress.toLowerCase(),
      name,
      symbol,
      decimals,
      owner,
      totalSupply,
      tokenCreationHash: txReceipt.transactionHash,
      blockNumber: txReceipt.blockNumber,
      hash: txReceipt.transactionHash,
    });

    // io.emit("newContractIsCreated", {
    //   address: contractAddress.toLowerCase(),
    //   name,
    //   symbol,
    //   decimals,
    //   owner,
    //   totalSupply,
    //   tokenCreationHash: txReceipt.transactionHash,
    //   blockNumber: txReceipt.blockNumber
    // });

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

    io.emit("newContractCreated", newTokenStructure);
  } catch (e) {
    // This contract is not ERC20 token contract.
    return;
  }
};

//Analyze the log for the token mint.
const detectForTokenMint = async (parameters) => {
  const { decodedLogs, txHash } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Transfer") {
      const contract = decodedLog.address.toLowerCase();
      const from = decodedLog.events[0].value;
      // const to = decodedLog.events[1].value;
      const value = decodedLog.events[2].value;
      if (match(from, CONTRACTS.DEAD)) {
        const tokenStructureInfoForCheck = await tokenStructure.findOne({
          address: contract,
        });
        if (tokenStructureInfoForCheck == null) continue;
        const alreadyMintedAmount =
          tokenStructureInfoForCheck.mintedAmount == undefined
            ? getBigNumberFromString("0")
            : getBigNumberFromString(tokenStructureInfoForCheck.mintedAmount);
        // const responseForTokenMint = await tokenStructure.findOneAndUpdate(
        await tokenStructure.findOneAndUpdate(
          {
            address: contract,
          },
          {
            mintedAmount: alreadyMintedAmount.add(
              getBigNumberFromString(value)
            ),
          },
          {}
        );
        console.log("We detect new token mint.", {
          token: contract,
          amount: value,
        });
      }
    }
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

      console.log("We detect WETH pair create.", {
        address: tokenAddress,
        pair: pair.toLowerCase(),
        pairToken: TOKENS.WETH,
        hash: txHash,
      });

      await tokenStructure.findOneAndUpdate(
        {
          address: tokenAddress,
        },
        {
          pair: pair.toLowerCase(),
          pairToken: TOKENS.WETH,
        },
        {}
      );
    }
  }
};

// Analyze the log of the transaction. Mainly find AddLiquidity.
const detectAddLiquidity = async (parameters) => {
  const { decodedLogs, txHash } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Mint") {
      // const sender = decodedLog.events[0].value;
      const amount0 = decodedLog.events[1].value;
      const amount1 = decodedLog.events[2].value;

      const tokenStructureInfoForCheck = await tokenStructure.findOne({
        pair: decodedLog.address.toLowerCase(),
      });
      if (tokenStructureInfoForCheck == null) continue;
      if (tokenStructureInfoForCheck.liquidityToken != undefined) continue;
      const contractAddress = tokenStructureInfoForCheck.address;
      const pairToken = tokenStructureInfoForCheck.pairToken;
      let ethAmount, tokenAmount;
      if (
        ethers.BigNumber.from(contractAddress).lt(
          ethers.BigNumber.from(pairToken)
        )
      ) {
        tokenAmount = amount0;
        ethAmount = amount1;
      } else {
        tokenAmount = amount1;
        ethAmount = amount0;
      }

      console.log("We detect addLiquidity", {
        pair: decodedLog.address.toLowerCase(),
        liquidityETH: ethAmount,
        liquidityToken: tokenAmount,
        hash: txHash,
      });
      await tokenStructure.findOneAndUpdate(
        {
          pair: decodedLog.address.toLowerCase(),
        },
        {
          liquidityETH: ethAmount,
          liquidityToken: tokenAmount,
        },
        {}
      );
    }
  }

  // Start detect for UniswapV2 pool token creation

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Transfer") {
      const from = decodedLog.events[0].value;
      const to = decodedLog.events[1].value;
      const value = decodedLog.events[2].value;
      if (match(from, CONTRACTS.DEAD) && !match(to, CONTRACTS.DEAD)) {
        const tokenStructureInfoForCheck = await tokenStructure.findOne({
          pair: decodedLog.address.toLowerCase(),
        });
        if (tokenStructureInfoForCheck == null) continue;
        let totalLiquidityAmount = ethers.BigNumber.from(
          tokenStructureInfoForCheck.totalLPAmount == undefined
            ? 0
            : tokenStructureInfoForCheck.totalLPAmount
        );
        let liquidityAmount = ethers.BigNumber.from(
          tokenStructureInfoForCheck.currentLPAmount == undefined
            ? 0
            : tokenStructureInfoForCheck.currentLPAmount
        );
        totalLiquidityAmount = totalLiquidityAmount.add(
          ethers.BigNumber.from(value)
        );
        liquidityAmount = liquidityAmount.add(ethers.BigNumber.from(value));

        // const responseForLPMint = await tokenStructure.findOneAndUpdate(
        await tokenStructure.findOneAndUpdate(
          {
            pair: decodedLog.address.toLowerCase(),
          },
          {
            totalLPAmount: totalLiquidityAmount,
            currentLPAmount: liquidityAmount,
          },
          {}
        );
        console.log("We detect new LP token mint", {
          pair: decodedLog.address.toLowerCase(),
          value,
          hash: txHash,
        });
      }
    }
  }
};

// Analyze the log of the transaction. Mainly find AddLiquidity.
const detectRemoveLiquidity = async (parameters) => {
  const { decodedLogs, txHash } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Burn") {
      // const sender = decodedLog.events[0].value;
      const amount0 = decodedLog.events[1].value;
      const amount1 = decodedLog.events[2].value;
      // const to = decodedLog.events[3].value;

      const tokenStructureInfoForCheck = await tokenStructure.findOne({
        pair: decodedLog.address.toLowerCase(),
      });
      if (tokenStructureInfoForCheck == null) continue;
      const contractAddress = tokenStructureInfoForCheck.address;
      const pairToken = tokenStructureInfoForCheck.pairToken;
      let ethAmount, tokenAmount;
      if (
        ethers.BigNumber.from(contractAddress).lt(
          ethers.BigNumber.from(pairToken)
        )
      ) {
        tokenAmount = amount0;
        ethAmount = amount1;
      } else {
        tokenAmount = amount1;
        ethAmount = amount0;
      }

      console.log("We detect remove liquidity", {
        pair: decodedLog.address.toLowerCase(),
        removedLiquidityETH: ethAmount,
        removedLiquidityToken: tokenAmount,
        hash: txHash,
      });
      await tokenStructure.findOneAndUpdate(
        {
          pair: decodedLog.address.toLowerCase(),
        },
        {
          removedLiquidityETH: ethAmount,
          removedLiquidityToken: tokenAmount,
        },
        {}
      );
    }
  }
};

// Start detect for UniswapV2 pool burn
const detectForRemoveLPToken = async (parameters) => {
  const { decodedLogs, txHash } = parameters;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Transfer") {
      const from = decodedLog.events[0].value;
      const to = decodedLog.events[1].value;
      const value = decodedLog.events[2].value;
      if (match(to, CONTRACTS.DEAD) && !match(from, CONTRACTS.DEAD)) {
        const tokenStructureInfoForCheck = await tokenStructure.findOne({
          pair: decodedLog.address.toLowerCase(),
        });
        if (tokenStructureInfoForCheck == null) continue;
        let liquidityAmount = ethers.BigNumber.from(
          tokenStructureInfoForCheck.currentLPAmount
        );
        liquidityAmount = liquidityAmount.sub(ethers.BigNumber.from(value));

        console.log("We detect new lp token burn", {
          pair: decodedLog.address.toLowerCase(),
          value,
          hash: txHash,
        });
        await tokenStructure.findOneAndUpdate(
          {
            pair: decodedLog.address.toLowerCase(),
          },
          {
            currentLPAmount: liquidityAmount,
          },
          {}
        );
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
          continue;
      } catch (e) {
        continue;
      }

      let swapDirection; // 0: WETH -> TOKEN(BUY), 1: TOKEN -> WETH(SELL)
      if (amount1Out == "0") {
        swapDirection = match(token0, TOKENS.WETH) ? 1 : 0;
      } else {
        swapDirection = match(token0, TOKENS.WETH) ? 0 : 1;
      }

      // const token = match(token0, TOKENS.WETH) ? token1 : token0; // current token;

      let tradeTokenAmount; // Trade amount of token
      if (swapDirection == 0) {
        tradeTokenAmount = amount0Out != "0" ? amount0Out : amount1Out;
      } else {
        tradeTokenAmount = amount0In != "0" ? amount0In : amount1In;
      }

      const tokenStructureInfoForCheck = await tokenStructure.findOne({ pair });
      if (tokenStructureInfoForCheck == null) continue;

      // console.log("We detect new swap", {
      //   pair,
      //   swapDirection,
      //   tradeTokenAmount,
      //   hash: txHash,
      // });

      
      const sniperTx = await wssProvider.getTransaction(tx.transactionHash);

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

        if(swapDirection == 0) {  //sniping buy
          if(sniperTx !== null && sniperTx.to !== null) {
            let toAddress = "";
            if(sniperTx.to.toLocaleLowerCase() === "0x3328F7f4A1D1C57c35df56bBf0c9dCAFCA309C49".toLocaleLowerCase()){
              toAddress = "BananaGun";
            }
            if(sniperTx.to.toLocaleLowerCase() === "0x7a250d5630b4cf539739df2c5dacb4c659f2488d".toLocaleLowerCase())
              toAddress = "UniswapV2Router";
            if(sniperTx.to.toLocaleLowerCase() === "0x80a64c6D7f12C47B7c66c5B4E20E72bc1FCd5d9e".toLocaleLowerCase()) {
              toAddress = "Maestro";
            }
            
            const gasPrice = ethers.utils.formatUnits(sniperTx.gasPrice !== undefined ? sniperTx.gasPrice : ethers.constants.Zero, "gwei")
            const gasUsed = tx.gasUsed

            await sniperTxsStructure.create({
              address: (match(token0, TOKENS.WETH) ? token1 : token0).toLowerCase(),
              txHash : sniperTx.hash,
              from : sniperTx.from,
              to : toAddress === "" ? sniperTx.to : toAddress,
              nonce : sniperTx.nonce,
              priorityFee : ethers.utils.formatUnits(sniperTx.maxPriorityFeePerGas !== undefined ? sniperTx.maxPriorityFeePerGas : ethers.constants.Zero, "gwei"),
              gasLimit : sniperTx.gasLimit.toString(),
              gasFee: gasPrice * gasUsed,
              gasUsed: gasUsed.toString(),
              value : ethers.utils.formatEther(sniperTx.value)
            })
          }
        }

        io.emit("swapEnabled", tokenStructureInfoForCheck);

        // let code, abi;
        // const fetchURL = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${tokenStructureInfoForCheck.address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`;
        // await fetch(fetchURL)
        //   .then((res) => res.json())
        //   .then((json) => {
        //     code = json.result[0].SourceCode;
        //     abi = json.result[0].ABI;
        //   })
        //   .catch(() => {
        //     console.log(
        //       "Error when getting smart contract code from etherscan."
        //     );
        //   });
        // tokenStructureInfoForCheck.contractSourceCode = code;
        // tokenStructureInfoForCheck.contractABI = abi;
        // await tokenStructureInfoForCheck.save();
      } else {
        tokenStructureInfoForCheck.buyCount =
          swapDirection == 0
            ? tokenStructureInfoForCheck.buyCount + 1
            : tokenStructureInfoForCheck.buyCount;
        tokenStructureInfoForCheck.sellCount =
          swapDirection == 1
            ? tokenStructureInfoForCheck.sellCount + 1
            : tokenStructureInfoForCheck.sellCount;
        if (blockNumber === tokenStructureInfoForCheck.firstSwapBlockNumber) {
          tokenStructureInfoForCheck.firstBlockBuyCount = tokenStructureInfoForCheck.buyCount;
          tokenStructureInfoForCheck.firstBlockSellCount = tokenStructureInfoForCheck.sellCount;

          if(swapDirection == 0) {  //sniping buy
            if(sniperTx !== null && sniperTx.to !== null) {
  
              let toAddress = "";
              if(sniperTx.to.toLocaleLowerCase() === "0x3328F7f4A1D1C57c35df56bBf0c9dCAFCA309C49".toLocaleLowerCase()){
                toAddress = "BananaGun";
              }
              if(sniperTx.to.toLocaleLowerCase() === "0x7a250d5630b4cf539739df2c5dacb4c659f2488d".toLocaleLowerCase())
                toAddress = "UniswapV2Router";
              if(sniperTx.to.toLocaleLowerCase() === "0x80a64c6D7f12C47B7c66c5B4E20E72bc1FCd5d9e".toLocaleLowerCase()) {
                toAddress = "Maestro";
              }

              const gasPrice = ethers.utils.formatUnits(sniperTx.gasPrice !== undefined ? sniperTx.gasPrice : ethers.constants.Zero, "gwei")
              const gasUsed = tx.gasUsed

              await sniperTxsStructure.create({
                address: (match(token0, TOKENS.WETH) ? token1 : token0).toLowerCase(),
                txHash : sniperTx.hash,
                from : sniperTx.from,
                to : toAddress === "" ? sniperTx.to : toAddress,
                nonce : sniperTx.nonce,
                priorityFee : ethers.utils.formatUnits(sniperTx.maxPriorityFeePerGas !== undefined ? sniperTx.maxPriorityFeePerGas : ethers.constants.Zero, "gwei"),
                gasLimit : sniperTx.gasLimit.toString(),
                gasFee: gasPrice * gasUsed,
                gasUsed: gasUsed.toString(),
                value : ethers.utils.formatEther(sniperTx.value)
              })
            }
          }
        }
          
        tokenStructureInfoForCheck.maxTradeTokenAmount = getBigNumberFromString(
          tokenStructureInfoForCheck.maxTradeTokenAmount
        ).lt(getBigNumberFromString(tradeTokenAmount))
          ? tradeTokenAmount
          : tokenStructureInfoForCheck.maxTradeTokenAmount;
        await tokenStructureInfoForCheck.save();
        io.emit("swapped", tokenStructureInfoForCheck);
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

            console.log("We detect lp transfer to dead wallet");
            io.emit("lpLocked", tokenStructureInfoForCheck);
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
    console.log("We detect lp lock", {
      token,
      amount,
      unlockTime,
      hash: txReceipt.transactionHash,
    });
    tokenStructureInfoForCheck.liquidityLockedAmount = amount;
    tokenStructureInfoForCheck.liquidityUnlockTime = unlockTime;
    tokenStructureInfoForCheck.liquidityLockedHash = txReceipt.transactionHash;
    tokenStructureInfoForCheck.liquidityLockedBuyCount = tokenStructureInfoForCheck.buyCount;
    tokenStructureInfoForCheck.liquidityLockedSellCount = tokenStructureInfoForCheck.sellCount;
    await tokenStructureInfoForCheck.save();
    io.emit("lpLocked", tokenStructureInfoForCheck);
  }
  tokenStructureInfoForCheck = await tokenStructure.findOne({
    address: token,
  });
  if (tokenStructureInfoForCheck != null) {
    console.log("We detect token lock", {
      token,
      amount,
      unlockTime,
      hash: txReceipt.transactionHash,
    });
    tokenStructureInfoForCheck.tokenLockedAmount = amount;
    tokenStructureInfoForCheck.tokenUnlockTime = unlockTime;
    tokenStructureInfoForCheck.tokenLockedHash = txReceipt.transactionHash;
    await tokenStructureInfoForCheck.save();
    io.emit("tokenLocked", tokenStructureInfoForCheck);
  }
};

const detectRemoveLimits = async (parameters) => {
  const { tx } = parameters;
  const txData = tx.data;
  const MethodID = txData.slice(0, 10);

  let updatedContractStructure;

  if (MethodID == "0x751039fc" || MethodID == "0x62256589") {
    //  removeLimits()
    // const caller = tx.from;
    const token = tx.to.toLowerCase();

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect removeLimits", {
        hash: tx.hash,
      });
      updatedContractStructure.removeLimitsHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else if (MethodID == "0xea1644d5") {
    // setMaxWalletSize(uint256 maxWalletSize)
    // const caller = tx.from;
    const token = tx.to.toLowerCase();
    const amount = ethers.BigNumber.from("0x" + txData.slice(10));

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect setMaxWalletSize", {
        amount,
        hash: tx.hash,
      });
      updatedContractStructure.maxWalletSize = amount;
      updatedContractStructure.setMaxWalletSizeHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else if (MethodID == "0x74010ece") {
    // setMaxTxnAmount(uint256 maxTxAmount)
    // const caller = tx.from;
    const token = tx.to.toLowerCase();
    const amount = ethers.BigNumber.from("0x" + txData.slice(10));

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect setMaxTxnAmount", {
        amount,
        hash: tx.hash,
      });
      updatedContractStructure.maxTxAmount = amount;
      updatedContractStructure.setMaxTxAmountHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else if (MethodID == "0x81bfdcca") {
    // changeMaxWalletAmount(uint256 _maxWalletAmount)
    // const caller = tx.from;
    const token = tx.to.toLowerCase();
    const amount = ethers.BigNumber.from("0x" + txData.slice(10));

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect changeMaxWalletAmount", {
        amount,
        hash: tx.hash,
      });
      updatedContractStructure.maxWalletSize = amount;
      updatedContractStructure.setMaxWalletSizeHash = tx.hash;
    }
  } else if (MethodID == "0x677daa57") {
    // changeMaxTxAmount(uint256 _maxTxAmount)
    // const caller = tx.from;
    const token = tx.to.toLowerCase();
    const amount = ethers.BigNumber.from("0x" + txData.slice(10));

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect changeMaxTxAmount", {
        amount,
        hash: tx.hash,
      });
      updatedContractStructure.maxTxAmount = amount;
      updatedContractStructure.setMaxTxAmountHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else if (MethodID == "0xec28438a") {
    // setMaxTxAmount(uint256 maxTxAmount)
    // const caller = tx.from;
    const token = tx.to.toLowerCase();
    const amount = ethers.BigNumber.from("0x" + txData.slice(10));

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect setMaxTxAmount", {
        amount,
        hash: tx.hash,
      });
      updatedContractStructure.maxWalletSize = amount;
      updatedContractStructure.setMaxWalletSizeHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else if (MethodID == "0x4019cfa9") {
    // maxLimits()
    // const caller = tx.from;
    const token = tx.to.toLowerCase();

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect maxLimits", {
        hash: tx.hash,
      });
      updatedContractStructure.removeLimitsHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else return;

  if (updatedContractStructure != null)
    io.emit("limitRemoved", updatedContractStructure);
};

const detectRenounceOwnerShip = async (parameters) => {
  const { tx } = parameters;
  const txData = tx.data;
  const MethodID = txData.slice(0, 10);

  let updatedContractStructure = null;

  if (MethodID == "0x715018a6") {
    // renounceOwnership()
    // const caller = tx.from;
    const token =
      tx.to.toLowerCase() == null
        ? tx.contractAddress.toLowerCase()
        : tx.to.toLowerCase();

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect renounceOwnership", {
        hash: tx.hash,
      });
      updatedContractStructure.renounceOwnerShipHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else if (MethodID == "0xf2fde38b") {
    // transferOwnership(address adr)
    // const caller = tx.from;
    const token = tx.to.toLowerCase();
    const updatedOwner = "0x" + txData.slice(txData.length - 40, txData.length);

    updatedContractStructure = await tokenStructure.findOne({
      address: token,
    });
    if (updatedContractStructure != null) {
      console.log("We detect transferOwnership", {
        updatedOwner,
        hash: tx.hash,
      });
      updatedContractStructure.updatedOwner = updatedOwner;
      updatedContractStructure.transferOwnershipHash = tx.hash;
      await updatedContractStructure.save();
    }
  } else return;

  if (updatedContractStructure !== null)
    io.emit("renounced", updatedContractStructure);
};

const doWhatBlockRecvNeed = async (block) => {
  const txs = block.transactions;
  for (const tx of txs) {
    const txReceipt = await wssProvider.getTransactionReceipt(tx.hash);
    try {
      // Ignore failed transaction
      if (txReceipt.status == 0) continue;

      // Detect for contract creation
      if (txReceipt.to == null && txReceipt.contractAddress != null) {
        // Analyze new contract is created
        await detectForContractCreation({ txReceipt });
      } else {
        // Analyze the logs for lock
        await detectLock({ txReceipt });

        // Analyze the transaction for remove limits
        await detectRemoveLimits({ tx });
      }
      // Analyze the transaction for remove limits
      await detectRenounceOwnerShip({ tx });

      let decodedLogs = [];
      try {
        decodedLogs = abiDecoder.decodeLogs(txReceipt.logs);
      } catch (e) {
        continue;
      }
      // Analyze the token mint
      await detectForTokenMint({
        decodedLogs,
        txHash: txReceipt.transactionHash,
      });

      // Analyze the logs for Pair create
      await detectPairCreate({
        decodedLogs,
        txHash: txReceipt.transactionHash,
      });

      // Analyze the logs for add liquidity
      await detectAddLiquidity({
        decodedLogs,
        txHash: txReceipt.transactionHash,
      });

      // Analyze the logs for remove liquidity
      await detectRemoveLiquidity({
        decodedLogs,
        txHash: txReceipt.transactionHash,
      });

      // Detect for the lp token burn. Will remove by remove liquidity or send it to the ZERO wallet.
      await detectForRemoveLPToken({
        decodedLogs,
        txHash: txReceipt.transactionHash,
      });

      // Analyze the logs for swap
      await detectSwapLogs({
        decodedLogs,
        tx: txReceipt,
        blockNumber: txReceipt.blockNumber,
      });
    } catch (e) {
      console.log("Error:", {txReceipt}, e);
    }
  }
};

export const getPriceFromBlockAndToken = async(block, token) => {
  
  try {
    const blockInfo = await wssProvider.getBlockWithTransactions(Number(block));  //get block information including transactions
    const txns = blockInfo.transactions // get block transactions
  
    let token0, token1

    let result = []
  
    if(!txns || txns === undefined) { // if no transactions, no need to analyse
      return {
        price: MAX_NUMBER,
        firstReserveWeth: -1
      } 
    }

    
    let first = true, start = null, end = null, price = 0.0;
  
    for (const tx of txns) {
      const txReceipt = await wssProvider.getTransactionReceipt(tx.hash); // get transaction information based on txHash. it's a bit different from tx

      let isSwap = false // flag to decide whethere transaction is swap or not
      let swapPair;

      try {

        // Ignore failed transaction
        if (txReceipt.status == 0) continue // no success transaction
        
        let decodedLogs = []
        try {
          decodedLogs = abiDecoder.decodeLogs(txReceipt.logs); //decode transation logs to detect excuted funtions in transaction
        } catch (e) {
          continue
        }

        for (const decodedLog of decodedLogs) {
          
          if (decodedLog.name !== "Swap") continue // no swap function
          
          const pair = decodedLog.address.toLowerCase(); // get pair address used in this swap function
          
          try {
            // If the pair is uniswap v2 pair
            token0 = await uniswapV2Pair.attach(pair).token0(); // token0 address in the pair
            token1 = await uniswapV2Pair.attach(pair).token1(); // token1 address in the pair
            
            if(token0.toLowerCase() !== token.toLowerCase() && token1.toLowerCase() !== token.toLowerCase()) continue // if token0 or token1 is not token inputed,  no need to analyse
            if(token0.toLowerCase() !== TOKENS.WETH && token1.toLowerCase() !== TOKENS.WETH) continue // if token0 or token1 is not token inputed,  no need to analyse
           
            if (
              pair !==
              getUniv2PairAddress({ tokenA: token0, tokenB: token1 }).toLowerCase() // if uniswap v2 pair is right?
            )
            continue;

            isSwap = true // this transation is ours
            swapPair = pair
            break
          } catch (e) {
            console.log(e)
            continue;
          }
        }
      } catch (e) {
        continue
      }
  
      // push found transations to response
      if(isSwap) {
        isSwap = false
        if (first) {
          await getReservesFromTransaction(tx.hash, true).then(reserves => {
            if (reserves) start = reserves
            else console.log('No reserve updates found in the transaction logs', token, swapPair);
            first = false;
          });
        } 
        await getReservesFromTransaction(tx.hash, false).then(reserves => {
          if (reserves) end = reserves
          else console.log('No reserve updates found in the transaction logs', token, swapPair);
        });
      }
    }
    if(start && end) {
      price = 1.0 * start.token * end.weth * 100 / end.token / start.weth - 100.0
      return {
        price: price < 0 ? MAX_NUMBER : price,
        firstReserveWeth: start.weth,
      }
    }
    return {
      price: MAX_NUMBER,
      firstReserveWeth: -1
    } 
  } catch(e) {
    console.log(e, block, "1")
    return {
      price: MAX_NUMBER,
      firstReserveWeth: -1
    } 
  }
}

const updateFirstSwapBlockTotalEthForTokens = async (block, token) => {
  try {
    const blockInfo = await wssProvider.getBlockWithTransactions(Number(block));  //get block information including transactions
    const txns = blockInfo.transactions // get block transactions
  
    let token0, token1

    if(!txns || txns === undefined) { // if no transactions, no need to analyse
      return -1
    }

    let totalEth = 0.0, firstTxTotalEth = 0.0, count = 0;
  
    for (const tx of txns) {
      const txReceipt = await wssProvider.getTransactionReceipt(tx.hash); // get transaction information based on txHash. it's a bit different from tx

      try {

        // Ignore failed transaction
        if (txReceipt.status == 0) continue // no success transaction
        
        let decodedLogs = []
        try {
          decodedLogs = abiDecoder.decodeLogs(txReceipt.logs); //decode transation logs to detect excuted funtions in transaction
        } catch (e) {
          continue
        }

        for (const decodedLog of decodedLogs) {
          
          if (decodedLog.name !== "Swap") continue // no swap function
          
          const pair = decodedLog.address.toLowerCase(); // get pair address used in this swap function
          const amount0In = decodedLog.events[1].value;
          const amount1In = decodedLog.events[2].value;
          const amount0Out = decodedLog.events[3].value;
          const amount1Out = decodedLog.events[4].value;
          
          try {
            // If the pair is uniswap v2 pair
            token0 = await uniswapV2Pair.attach(pair).token0(); // token0 address in the pair
            token1 = await uniswapV2Pair.attach(pair).token1(); // token1 address in the pair
            
            if(token0.toLowerCase() !== token.toLowerCase() && token1.toLowerCase() !== token.toLowerCase()) break // if token0 or token1 is not token inputed,  no need to analyse
           
            if (
              pair !==
              getUniv2PairAddress({ tokenA: token0, tokenB: token1 }).toLowerCase() // if uniswap v2 pair is right?
            )
            break;
          } catch (e) {
            console.log(e)
            break;
          }

          let swapDirection = -1; // 0: WETH -> TOKEN(BUY), 1: TOKEN -> WETH(SELL)
          if (amount1Out == "0") {
            swapDirection = match(token0, TOKENS.WETH) ? 1 : 0;
          } else {
            swapDirection = match(token0, TOKENS.WETH) ? 0 : 1;
          }

          if(swapDirection != 0) break;

          let tradeWethAmount = amount0In != "0" ? amount0In : amount1In;
          totalEth += parseFloat(tradeWethAmount) / 1000000000000000000.0;
          if (count ++ < FIRST_TX_COUNT) firstTxTotalEth += parseFloat(tradeWethAmount) / 1000000000000000000.0;
        }
      } catch (e) {
        continue
      }

    }
    return {
      totalEth: totalEth,
      firstTxTotalEth: firstTxTotalEth,
    };
  } catch(e) {
    console.log(e, block, "2")
    return parseFloat({
      totalEth: 0,
      firstTxEth: 0,
    });
  }
}

const updateFirstSwapBlockTotalInfo = async (contractAddress) => {
  try {
    const tokenInfo = await tokenStructure.findOne({
      address: contractAddress,
    });
    let sniperTxsDB = await sniperTxsStructure.find({address: contractAddress}); 

    if (tokenInfo != null) {

      const blockInfo = await wssProvider.getBlockWithTransactions(Number(tokenInfo.firstSwapBlockNumber));  //get block information including transactions
      const txns = blockInfo.transactions // get block transactions

      let totalBribe = 0.0, totalTxFee = 0.0;
      let firstTxTotalBribe = 0.0, firstTotalTxFee = 0.0, count = 0;
      
      for(let i = 0; i < sniperTxsDB.length; i ++) {
        let pos = txns.findIndex(tx => tx.hash === sniperTxsDB[i].txHash)
        let tx = txns[pos]
        let bribe = await getInternalTxns(tx.from, tx.to, tx.hash)
        
        sniperTxsDB[i] = {
          ...sniperTxsDB[i]._doc, 
          position: pos,
          bribe: bribe,  
        }

        totalBribe += parseFloat(bribe);
        totalTxFee += parseFloat(sniperTxsDB[i].gasFee) / 1000000000.0;
        
        if(count ++ < FIRST_TX_COUNT) {
          firstTxTotalBribe += parseFloat(bribe);
          firstTotalTxFee += parseFloat(sniperTxsDB[i].gasFee) / 1000000000.0;
        }
      }

      return {
        success: true,
        totalBribe: totalBribe,
        totalTxFee: totalTxFee,
        firstTxTotalBribe: firstTxTotalBribe,
        firstTotalTxFee: firstTotalTxFee,
      }

    } else {
      return {
        success: false,
        error: "address is wrong."
      }
    }
  } catch (e) {
    console.log(e, block, "3")
    return {
      success: false,
      error: e.message,
    };
  }
};

export const getAvgMaxPriFeeOfSecBlk = async(block, token) => {
  try {
    const blockInfo = await wssProvider.getBlockWithTransactions(Number(block));  //get block information including transactions
    const txns = blockInfo.transactions // get block transactions
  
    let token0, token1

    if(!txns || txns === undefined) { // if no transactions, no need to analyse
      return 0
    }

    let sum = 0.0, avg = 0.0, count = 0;
  
    for (const tx of txns) {
      const txReceipt = await wssProvider.getTransactionReceipt(tx.hash); // get transaction information based on txHash. it's a bit different from tx

      try {

        // Ignore failed transaction
        if (txReceipt.status == 0) continue // no success transaction
        
        let decodedLogs = []
        try {
          decodedLogs = abiDecoder.decodeLogs(txReceipt.logs); //decode transation logs to detect excuted funtions in transaction
        } catch (e) {
          continue
        }

        for (const decodedLog of decodedLogs) {
          
          if (decodedLog.name !== "Swap") continue // no swap function
          
          const pair = decodedLog.address.toLowerCase(); // get pair address used in this swap function
          
          try {
            // If the pair is uniswap v2 pair
            token0 = await uniswapV2Pair.attach(pair).token0(); // token0 address in the pair
            token1 = await uniswapV2Pair.attach(pair).token1(); // token1 address in the pair
            
            if(token0.toLowerCase() !== token.toLowerCase() && token1.toLowerCase() !== token.toLowerCase()) continue // if token0 or token1 is not token inputed,  no need to analyse
            if(token0.toLowerCase() !== TOKENS.WETH && token1.toLowerCase() !== TOKENS.WETH) continue // if token0 or token1 is not token inputed,  no need to analyse
            
            if (
              pair !==
              getUniv2PairAddress({ tokenA: token0, tokenB: token1 }).toLowerCase() // if uniswap v2 pair is right?
            )
            continue;

            count ++;
            sum += parseFloat(ethers.utils.formatUnits(tx.maxPriorityFeePerGas !== undefined ? tx.maxPriorityFeePerGas : ethers.constants.Zero, "gwei"))
            // console.log("sum", sum)
            break
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        continue
      }
    }

    if(count >= 1) {
      avg = parseFloat(sum) / parseFloat(count);
    }
    return avg;
  } catch(e) {
    console.log(e, block, "4")
    return 0;
  }
}

export const update = async () => {
  // update latest tokens
  // const tokens = await getLatestTokens()
  const tokens = await getNeedUpdateTokens()
  // const tokens = await getFilteredTokens()

  console.log(tokens.length)
  let i;
  let len = tokens.length;
  let newToken, firstSwapBlockTotalInfo;
  try {
    for (i = 0; i < len; ++ i) {
      console.log(tokens[i].address)
      console.log(tokens[i].firstSwapBlockNumber)
      newToken = await tokenStructure.findOne({ address: tokens[i].address })
     
      let totalEthInfo = await updateFirstSwapBlockTotalEthForTokens(tokens[i].firstSwapBlockNumber, tokens[i].address)
      newToken.firstSwapBlockTotalEthForTokens = totalEthInfo.totalEth
      newToken.firstTxTotalEth = totalEthInfo.firstTxTotalEth

      firstSwapBlockTotalInfo = await updateFirstSwapBlockTotalInfo(tokens[i].address.toLowerCase())
      if(firstSwapBlockTotalInfo.success) {
        newToken.firstSwapBlockTotalBribe = firstSwapBlockTotalInfo.totalBribe
        newToken.firstSwapBlockTotalTxFee = firstSwapBlockTotalInfo.totalTxFee
        newToken.firstTxTotalBribe        = firstSwapBlockTotalInfo.firstTxTotalBribe
        newToken.firstTxTotalFee          = firstSwapBlockTotalInfo.firstTotalTxFee
      } else {
        console.log(firstSwapBlockTotalInfo.error)
      }
  
      newToken.avgMaxPriFeeOfSecBlk = await getAvgMaxPriFeeOfSecBlk(tokens[i].firstSwapBlockNumber + 1, tokens[i].address)
      
      newToken.firstSwapDate = await getBlockTimestamp(newToken.firstSwapBlockNumber)
      
      if(newToken.firstSwapBlockTotalEthForTokens > 0) {
        if(newToken.firstSwapBlockTotalBribe < 0.1) newToken.ethToBribeRatio = 0
        else newToken.ethToBribeRatio = 1.0 * (newToken.firstSwapBlockTotalBribe + newToken.firstSwapBlockTotalTxFee) / newToken.firstSwapBlockTotalEthForTokens
      } else {
        console.log("address is wrong.")
      }
      
      const { price, firstReserveWeth } = await getPriceFromBlockAndToken(tokens[i].firstSwapBlockNumber, tokens[i].address)
      newToken.price = price
      newToken.firstReserveWeth = parseFloat(firstReserveWeth)
      newToken.nonceToPriceRatio = price == MAX_NUMBER ? MAX_NUMBER : (parseFloat(newToken.price) + parseFloat(100)) / tokens[i].firstBlockBuyCount;
      newToken.save()
    }
    console.log("update done")
  } catch(e) {
    console.log("----------------------------",tokens[i].firstBlockBuyCount)
    console.log(e.message)
    return;
  } 
};

export const updateSwapEnableTokens = async (tokens) => {
  let i;
  let len = tokens.length;
  let newToken, firstSwapBlockTotalInfo;
  try {
    for (i = 0; i < len; ++ i) {
      newToken = await tokenStructure.findOne({ address: tokens[i] })
      if(newToken.firstReserveWeth != -1) continue;
      // console.log("update start:", newToken)
     
      let totalEthInfo = await updateFirstSwapBlockTotalEthForTokens(newToken.firstSwapBlockNumber, newToken.address)
      newToken.firstSwapBlockTotalEthForTokens = totalEthInfo.totalEth
      newToken.firstTxTotalEth = totalEthInfo.firstTxTotalEth

      firstSwapBlockTotalInfo = await updateFirstSwapBlockTotalInfo(newToken.address.toLowerCase())
      if(firstSwapBlockTotalInfo.success) {
        newToken.firstSwapBlockTotalBribe = firstSwapBlockTotalInfo.totalBribe
        newToken.firstSwapBlockTotalTxFee = firstSwapBlockTotalInfo.totalTxFee
        newToken.firstTxTotalBribe        = firstSwapBlockTotalInfo.firstTxTotalBribe
        newToken.firstTxTotalFee          = firstSwapBlockTotalInfo.firstTotalTxFee
      } else {
        console.log(firstSwapBlockTotalInfo.error)
      }
  
      newToken.avgMaxPriFeeOfSecBlk = await getAvgMaxPriFeeOfSecBlk(newToken.firstSwapBlockNumber, newToken.address)
      
      newToken.firstSwapDate = await getBlockTimestamp(newToken.firstSwapBlockNumber)
      
      if(newToken.firstSwapBlockTotalEthForTokens > 0) {
        if(newToken.firstSwapBlockTotalBribe < 0.1) newToken.ethToBribeRatio = 0
        else newToken.ethToBribeRatio = 1.0 * (newToken.firstSwapBlockTotalBribe + newToken.firstSwapBlockTotalTxFee) / newToken.firstSwapBlockTotalEthForTokens
      } else {
        console.log("address is wrong.")
      }
      
      const { price, firstReserveWeth } = await getPriceFromBlockAndToken(newToken.firstSwapBlockNumber, newToken.address)
      newToken.price = price
      newToken.firstReserveWeth = parseFloat(firstReserveWeth)
      newToken.nonceToPriceRatio = price == MAX_NUMBER ? MAX_NUMBER : (parseFloat(newToken.price) + parseFloat(100)) / newToken.firstBlockBuyCount;
      newToken.save()
      // console.log("update end:", newToken)
      
    }
  } catch(e) {
    console.log("----------------------------",newToken.firstBlockBuyCount)
    console.log(e.message)
    return;
  } 
}
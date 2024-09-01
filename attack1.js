import { Contract, ethers } from "ethers";
import {
  wssProvider,
  IERC20,
  uniswapV2Pair,
  CONTRACTS,
  TOKENS,
  uniswapV2Router,
} from "./src/constants.js";
import IERC20ABI from "./src/abi/IERC20.js";
import IUniswapV2Pair from "./src/abi/IUniswapV2Pair.js";
// import IUniswapV2Router02 from "./src/abi/IUniswapV2Router02.js";
import IUniswapV2Factory from "./src/abi/IUniswapV2Factory.js";
import IUniswapV2Router from "./src/abi/IUniswapV2Router02.js";
import IUniswapV2RouterAbi from "./src/abi/IUniswapV2Router02.js";
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
import { constants } from "buffer";
import { getUniv2Reserve } from "./src/univ2.js";
import { isContractVerified } from "./src/utils.js";
import { getTxLimit } from "./src/univ2.js";

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(IUniswapV2Router);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);

const SERVER_URL =  "http://localhost:" + process.env.PORT;
const NONCE_SMALL_LIMIT = 3;

const PRICE_LIMIT = 450;

const SNIPED_LIMIT = 80;

const OWNERBUY_LIMIT = 10;

const BRIBE_LIMIT = 0.9;


let dataSniped, dataPrice, dataNonce0, dataBribe, dataAsiaTime, dataSnipers;

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
    let tokenStructureInfoForCheck = await attack1Tokens.findOne({
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
          const to = decodedLog.events[1].value;
          const value = decodedLog.events[2].value;
          if (match(to, CONTRACTS.DEAD) || match(to, CONTRACTS.DEAD2)) {
            if(tokenStructureInfoForCheck.openTrading == true) return;
            tokenStructureInfoForCheck.lockedBeforeSwap = true
            await tokenStructureInfoForCheck.save();
            return;
          }
        }
      }
    } else return;
  }

  if (token === undefined) return;
  
  let tokenStructureInfoForCheck = await attack1Tokens.findOne({
    pair: token,
  });

  if (tokenStructureInfoForCheck != null) {
    if(tokenStructureInfoForCheck.openTrading == true) return;
    tokenStructureInfoForCheck.lockedBeforeSwap = true
    await tokenStructureInfoForCheck.save();
  }
};

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

      try {
        await attack1Tokens.create({
          address: tokenAddress,
          pair: pair.toLowerCase(),
        })
        const {buyTax, sellTax} = await getTokenTaxInfo(tokenAddress)
        console.log("We detect WETH pair create.", {
          address: tokenAddress,
          pair: pair.toLowerCase(),
          buyTax,
          sellTax,
        });
      } catch(e) {
        console.log("Pair already exist.")
        return;
      }
    }
  }
};

const getHourFromServerDate = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  return parseInt(hours);
}

// Analyze the log of the transaction. Mainly find swap methods.
const detectSwapLogs = async (parameters) => {
  const { decodedLogs, tx, blockNumber } = parameters;

  let tradeTokenAmount, tradeWethAmount; // Trade amount of token
  let reserveToken, reserveWeth;
  let tokenCheck;
  let status;
  let pair;

  for (const decodedLog of decodedLogs) {
    if (decodedLog.name == "Swap") {
      pair = decodedLog.address.toLowerCase();

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

      if(!(match(token0, TOKENS.WETH) || match(token1, TOKENS.WETH))) continue;

      let swapDirection = -1; // 0: WETH -> TOKEN(BUY), 1: TOKEN -> WETH(SELL)
      if (amount1Out == "0") {
        swapDirection = match(token0, TOKENS.WETH) ? 1 : 0;
      } else {
        swapDirection = match(token0, TOKENS.WETH) ? 0 : 1;
      }

      if(swapDirection != 0) return;

      // const token = match(token0, TOKENS.WETH) ? token1 : token0; // current token;

      tokenCheck = await attack1Tokens.findOne({ pair });
      if (tokenCheck == null) return;

      tradeTokenAmount = amount0Out != "0" ? amount0Out : amount1Out;
      tradeWethAmount = amount0In != "0" ? amount0In : amount1In;

      const sniperTx = await wssProvider.getTransaction(tx.transactionHash);

      if(tokenCheck.openTrading == false) {
        tokenCheck.openTrading = true;
        tokenCheck.firstSwapBlockNumber = blockNumber;
        tokenCheck.sniped = 1;
        if (sniperTx.nonce <= NONCE_SMALL_LIMIT)  tokenCheck.nonce0 = 1;
        status = 1; // first swap
      } 
      
      else if(tokenCheck.firstSwapBlockNumber == blockNumber) {
        tokenCheck.sniped ++;
        if (sniperTx.nonce <= NONCE_SMALL_LIMIT)  tokenCheck.nonce0 ++;
        status = 2; // sniper attack
      } 
      
      else return;
    }
    else if (decodedLog.name == 'Sync') {
      const reserve0 = decodedLog.events[0].value;
      const reserve1 = decodedLog.events[1].value;

      pair = decodedLog.address.toLowerCase();

      let token0, token1;
      try {
        token0 = await uniswapV2Pair.attach(pair).token0();
        token1 = await uniswapV2Pair.attach(pair).token1();
       } catch (e) {
        return;
      }

      if (match(token0, TOKENS.WETH)) {
        reserveWeth = reserve0;
        reserveToken = reserve1;
      } else if (match(token1, TOKENS.WETH)) {
        reserveWeth = reserve1;
        reserveToken = reserve0;
      } 
      else return;
    }
  }

  // If this is first swap, 
  if(status == 1) {
    // we need to calculate limit ratio

    // calc reserve state before swap
    tokenCheck.firstReserveToken = parseFloat(reserveToken) + parseFloat(tradeTokenAmount);
    tokenCheck.firstReserveWeth = parseFloat(reserveWeth) - parseFloat(tradeWethAmount); 

    tokenCheck.lastReserveToken = parseFloat(reserveToken);
    tokenCheck.lastReserveWeth = parseFloat(reserveWeth); 
    
    tokenCheck.maxSwapTokenAmount = parseFloat(tradeTokenAmount);

    // tokenCheck.limit = parseFloat(tradeTokenAmount) / parseFloat(tokenCheck.firstReserveToken) * 100.0;
    try {
      tokenCheck.limit = await getTxLimit(tokenCheck.address, ethers.BigNumber.from((tokenCheck.firstReserveToken).toString()))
    } catch(e) {
      tokenCheck.limit = -1
    }
    
    tokenCheck.price = parseFloat(tokenCheck.firstReserveToken) * parseFloat(tokenCheck.lastReserveWeth) / parseFloat(tokenCheck.lastReserveToken) / parseFloat(tokenCheck.firstReserveWeth) * 100.0 - 100.0;
    tokenCheck.firstSwapTotalBribe = parseFloat(await getInternalTxns(tx.from, tx.to, tx.transactionHash))
    tokenCheck.firstSwapAtAsiaTime = getHourFromServerDate(await getBlockTimestamp(blockNumber - 1)) < 16 ? true : false;
    tokenCheck.firstSwapVerified = await isContractVerified(tokenCheck.address);

    dataPrice[pair] = tokenCheck.price;
    dataSniped[pair] = tokenCheck.sniped;
    dataNonce0[pair] = tokenCheck.nonce0;
    dataBribe[pair] = tokenCheck.firstSwapTotalBribe
    dataAsiaTime[pair] = tokenCheck.firstSwapAtAsiaTime

    // update snipers
    tokenCheck.save()

    const {buyTax, sellTax} = await getTokenTaxInfo(tokenCheck.address)
    console.log("We detect first swap.", {
      buyTax,
      sellTax,
    });
  } else if (status == 2) { // If this is sniper attack, 
    // update price
    tokenCheck.lastReserveToken = parseFloat(reserveToken);
    tokenCheck.lastReserveWeth = parseFloat(reserveWeth); 

    tokenCheck.maxSwapTokenAmount = tokenCheck.maxSwapTokenAmount < parseFloat(tradeTokenAmount) ? parseFloat(tradeTokenAmount) : tokenCheck.maxSwapTokenAmount;

    tokenCheck.price = parseFloat(tokenCheck.firstReserveToken) * parseFloat(tokenCheck.lastReserveWeth) / parseFloat(tokenCheck.lastReserveToken) / parseFloat(tokenCheck.firstReserveWeth) * 100.0 - 100.0;
    tokenCheck.firstSwapTotalBribe = tokenCheck.firstSwapTotalBribe + parseFloat(await getInternalTxns(tx.from, tx.to, tx.transactionHash))
    
    dataPrice[pair] = tokenCheck.price;
    dataSniped[pair] = tokenCheck.sniped;
    dataNonce0[pair] = tokenCheck.nonce0;
    dataBribe[pair] = tokenCheck.firstSwapTotalBribe

    tokenCheck.save()
  }
};
  
const doWhatBlockRecvNeed = async (block, blockNumber) => {
  const txs = block.transactions;

  dataSniped = {}
  dataPrice = {}
  dataNonce0 = {}
  dataBribe = {}
  dataAsiaTime = {}

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
      }

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

      // // Analyze the logs for swap
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

  for (let pair in dataSniped) {
    if (!dataSniped.hasOwnProperty(pair)) continue;

    
    // check if this token is valualbe or not.
    if (dataBribe[pair] < BRIBE_LIMIT) continue;
    if (dataPrice[pair] > PRICE_LIMIT) continue;
    // if (Math.abs(dataNonce0[pair] - dataSniped[pair]) < OWNERBUY_LIMIT) continue;
    // if (dataSniped[pair] < SNIPED_LIMIT) continue;
    let level = 1;
    if (dataAsiaTime[pair] == true) level += 2;
    
    // We need to attack this pair!!!!
    let tokenCheck = await attack1Tokens.findOne({ pair });

    console.log("token:", tokenCheck)
    if(tokenCheck.lockedBeforeSwap) level += 4;
    
    // calc proper amountInf
    let weth = parseFloat(tokenCheck.lastReserveWeth)
    let token = parseFloat(tokenCheck.lastReserveToken)
    let limit = parseFloat(tokenCheck.limit)
    let maxAmount = parseFloat(tokenCheck.maxSwapTokenAmount)
    console.log("maxAmount", maxAmount)
    console.log("limitAmount", token * parseFloat(limit) / 100.0)
    console.log("firstlimitAmount", parseFloat(tokenCheck.firstReserveToken) * parseFloat(limit) / 100.0)
    let amountOut = Math.max(token * parseFloat(limit) / 100.0, maxAmount)
    let amountIn = 2 * (1.0 * weth / (token - amountOut) * token - weth)

    console.log(amountIn, amountOut)
    
    // attack api request
    let data = {
      token: tokenCheck.address,
      pair: tokenCheck.pair,
      walletCount: 100, // 
      value: amountIn / 1000000000000000000.0, // Eth
      maxPriorityFee: 81, // Gwei
      level: level,
    } 
    console.log("data", data)
    
    // Call attack backend!

    await axios({
      method: "post",
      url: `${SERVER_URL}/api/v2/attack/no1`,
      data: data,
    })
    .then(res => {
      console.log("Attack is being done on:", res.data)
      tokenCheck.bought = true
      tokenCheck.profitLevel = level;
      tokenCheck.save()
    });
  }
};

const getTokenTaxInfo = async (tokenAddress) => {
  const apiUrl = `https://api.honeypot.is/v2/IsHoneypot?address=${tokenAddress}`; // Example endpoint
  try {
    const response = await axios.get(apiUrl);
    if (response.data) {
      const { buyTax, sellTax } = response.data.simulationResult;
      return {
        buyTax,
        sellTax,
      }
    } else {
      console.log('No data available for the provided token address.');
    }
  } catch (error) {
    return {
      buyTax: undefined,
      sellTax: undefined,
    }
  }
}

export const attack1 = async () => {
  // // // Test get Tx Limit
  // const [reserveA, reserveB] = await getUniv2Reserve({
  //   tokenA: "0x69961e71062cff75d9cd1e4321e98290ca1eac59",
  //   tokenB: TOKENS.WETH,
  //   pair: "0xccf144753c6d020951992cf84d57846a804c826e",
  // })
  // console.log("firstReserveToken:", ethers.BigNumber.from("100000000000000000"))
  // console.log("reserve:-------", reserveA, reserveB)
  // console.log("txLimit:-------", await getTxLimit('0x69961e71062cff75d9cd1e4321e98290ca1eac59', 100000000000))
  
  // let start = 19718479, end = 19718548;
  // let start = 19706514, end = 19719146;
  // let start = 19661616, end = 19661661;
  // for(var i = 19661616; i <= end; i+=19661661 - 19661616) {
  //   const block = await wssProvider.getBlockWithTransactions(i);
  //   await doWhatBlockRecvNeed(block, block.number);
  // }
  // console.log("done")
  
  let prevBlock = 0;
  wssProvider.on("block", async (curBlock) => {
    if (prevBlock >= curBlock) return;
    prevBlock = curBlock;
  
    const blkReceiveTime = Date.now() / 1000;
  
    try {
      const block = await wssProvider.getBlockWithTransactions(curBlock);
      console.log(
        block.number,
        block.timestamp,
        blkReceiveTime,
        block.timestamp - blkReceiveTime
      );
      await doWhatBlockRecvNeed(block, block.number);
    } catch (e) {
      console.log("Error", e);
    }
  });
};

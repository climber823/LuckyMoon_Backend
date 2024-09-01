import express from "express";
import {createServer} from "http";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import {contractInfoRouter} from "../routes/contractInfo.js";
import {simulationResult} from "../routes/simulationResult.js";
import { attackRouter } from "../routes/attack.js";
import tokenStructure from "../models/tokens.js";
import simulationStructure from "../models/simulations.js";
import { wssProvider } from "../src/constants.js";
import { getSniperModel, getSniperTxNonce0, getFilteredTokens } from "../controllers/contractInfo.js";
import { TOKEN_LIST_SEND_SIZE } from "../src/constants.js";
import sniperTxsStructure from "../models/sniperTxs.js";
const app = express();
// Init Middleware
app.use(morgan("dev"));
app.use(cors());

// parse requests of content-type - application/json
app.use(express.json());/* bodyParser.json() is deprecated */

// parse requests of content-type - application/x-www-form-urlencoded
app.use(
  express.urlencoded({ extended: true })
); /* bodyParser.urlencoded() is deprecated */

const port = process.env.PORT || 52222;

var httpServer = app.listen(port, (error) => {
  if (error) {
    console.log("Error ocurred: " + error);
    return;
  }
  console.log(`Express Server running on Port: ${port}`);
});

const getTokens = async(skip, limit) => {
  // let contracts = await tokenStructure.find({pair: {$ne: null}}).sort({createdAt: -1}).skip(skip).limit(limit);
  // const tokens = [];
  // for(let i = 0 ; i < contracts.length ; ++ i){
  //   // if(contracts[i].firstBlockBuyCount == undefined || contracts[i].firstBlockBuyCount < 5) continue;
  //   // const sniperTxsDB = await sniperTxsStructure.find({address: contracts[i].address}, {txHash: 1});
  //   // const sniperInfo = await getSniperModel(sniperTxsDB);
    
  //   const snipeData = await getSniperTxNonce0(contracts[i].address)

  //   let tokenInfo = {
  //     address: contracts[i].address,
  //     name: contracts[i].name,
  //     symbol: contracts[i].symbol,
  //     pair: contracts[i].pair,
  //     blockNumber: contracts[i].blockNumber,
  //     buyCount: contracts[i].buyCount,
  //     sellCount: contracts[i].sellCount,
  //     liquidityLockedHash: contracts[i].liquidityLockedHash,
  //     removeLimitsHash: contracts[i].removeLimitsHash,
  //     setMaxTxAmountHash: contracts[i].setMaxTxAmountHash,
  //     renounceOwnerShipHash: contracts[i].renounceOwnerShipHash,
  //     updatedOwner: contracts[i].updatedOwner,
  //     liquidityUnlockTime: contracts[i].liquidityUnlockTime,
  //     level: contracts[i].level,
  //     liquidityLockedBuyCount: contracts[i].liquidityLockedBuyCount,
  //     liquidityLockedSellCount: contracts[i].liquidityLockedSellCount,
  //     // firstSwapBlockNumber: contracts[i].firstSwapBlockNumber,
  //     firstBlockBuyCount: contracts[i].firstBlockBuyCount,
  //     firstBlockSellCount: contracts[i].firstBlockSellCount,
  //     snipeData: {...snipeData, block: contracts[i].firstSwapBlockNumber},
  //     createdAt: contracts[i].createdAt,
  //     updatedAt: contracts[i].updatedAt,
  //     // snipeData: {Maestro: sniperInfo.MaestroCount, Banana: sniperInfo.BGCount},
  //   };

   
  //   tokens.push(tokenInfo)
  // }
  const tokens = await getFilteredTokens()
  return tokens
}

let skip = 0
let interval = 0

export const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", async (socket) => {
  console.log("client connected: ", socket.id);

  ////
  ////
  /////
  /////   REVERT the createdAt!
  /////
  ////
  // const currentBlockNumber = await wssProvider.getBlockNumber();
  // let contracts = await tokenStructure.find({ blockNumber: { $gt: currentBlockNumber - 7200 } }).sort({createdAt: -1});

  const tokens = await getTokens(0, TOKEN_LIST_SEND_SIZE)
  io.to(socket.id).emit("clientConnected", {contracts: tokens})

  // const interval = setInterval(async() => {
  //   skip += TOKEN_LIST_SEND_SIZE
  //   let tokens = await getTokens(skip, TOKEN_LIST_SEND_SIZE)
  //   if(tokens.length === 0) {
  //     clearInterval(interval)
  //     return
  //   }
  //   io.emit("clientConnected", {contracts: await getTokens(skip, TOKEN_LIST_SEND_SIZE)})
  // }, 2000)

  // interval = setInterval(async() => {
  //   skip += TOKEN_LIST_SEND_SIZE
  //   let tokens = await getTokens(skip, TOKEN_LIST_SEND_SIZE)
  //   console.log("tokens---", socket.id + "-----" + tokens.length + "     " + skip)
  //   if(tokens.length === 0) {
  //     clearInterval(interval)
  //     skip = 0
  //     interval = null
  //     return
  //   }
  //   io.to(socket.id).emit("clientConnected", {contracts: tokens})
  // }, 1000)
  // io.emit("clientConnected", {contracts: tokens.slice(0, TOKEN_LIST_SEND_SIZE), size: TOKEN_LIST_SEND_SIZE});
  // socket.on('clientConnected', (req) => {
  //   let size = req.size
  //   if(size === -1) return
  //   console.log('here is --------------- ', size)
  //   let limit = TOKEN_LIST_SEND_SIZE + size
  //   limit = limit >= tokens.length ? tokens.length : limit
  //   io.emit('clientConnected', {contracts: tokens.slice(size, limit), size: limit === tokens.length ? -1 : limit})
  //   io.emit("clientConnected", {contracts: tokens});
  // })

  socket.on("disconnect", (reason) => {
    console.log(`Socket Disconnect: ${reason}`);
    clearInterval(interval)
    skip = 0
    interval = null
  });
});

app.use("/api/v1/contractInfo", contractInfoRouter);
app.use("/api/v1/simulation", simulationResult);

app.use("/api/v2/attack", attackRouter);

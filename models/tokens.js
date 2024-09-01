import mongoose from "mongoose";
import { MAX_NUMBER } from "../src/constants.js"

const tokensSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    decimals: {
      type: Number,
      required: true,
    },
    owner: {
      type: String,
      require: true,
    },
    totalSupply: {
      type: String,
    },
    tokenCreationHash: {
      type: String,
    },
    blockNumber: {
      type: Number,
    },
    mintedAmount: {
      type: String,
    },
    pair: {
      type: String,
    },
    pairToken: {
      type: String,
    },
    liquidityETH: {
      type: String,
    },
    liquidityToken: {
      type: String,
    },
    removedLiquidityETH: {
      type: String,
    },
    removedLiquidityToken: {
      type: String,
    },
    totalLPAmount: {
      type: String,
    },
    currentLPAmount: {
      type: String,
    },
    buyCount: {
      type: Number,
    },
    sellCount: {
      type: Number,
    },
    maxTradeTokenAmount: {
      type: String,
    },
    tokenUnlockTime: {
      type: Number,
    },
    tokenLockedAmount: {
      type: String,
    },
    tokenLockedHash: {
      type: String,
    },
    liquidityUnlockTime: {
      type: Number,
    },
    liquidityLockedAmount: {
      type: String,
    },
    liquidityLockedHash: {
      type: String,
    },
    liquidityLockedBuyCount : {
      type: Number,
    },
    liquidityLockedSellCount: {
      type: Number
    },
    removeLimitsHash: {
      type: String,
    },
    maxWalletSize: {
      type: String,
    },
    setMaxWalletSizeHash: {
      type: String,
    },
    maxTxAmount: {
      type: String,
    },
    setMaxTxAmountHash: {
      type: String,
    },
    renounceOwnerShipHash: {
      type: String,
    },
    transferOwnershipHash: {
      type: String,
    },
    updatedOwner: {
      type: String,
    },
    contractSourceCode: {
      type: String,
      default: "",
    },
    contractABI: {
      type: String,
      default: "[]",
    },
    level: {
      type: Number,
      default: 0,
    },
    firstSwapBlockNumber: {
      type: Number,
    },
    firstBlockBuyCount: {
      type: Number,
    },
    firstBlockSellCount: {
      type: Number,
    },
    nonceToPriceRatio: {
      type: Number,
      default: MAX_NUMBER
    },
    price: {
      type: Number,
      default: MAX_NUMBER
    },
    firstSwapBlockTotalBribe: {
      type: Number,
      default: 0
    },
    firstSwapBlockTotalTxFee: {
      type: Number,
      default: 0
    },
    firstSwapBlockTotalEthForTokens: {
      type: Number,
      default: 0
    },
    ethToBribeRatio: {
      type: Number,
      default: 0
    },
    profit: {
      type: Number,
      default: -101,
    },
    firstSwapDate: {
      type: Date,
    },
    avgMaxPriFeeOfSecBlk: {
      type: Number,
      default: 0
    },
    firstSwapVerified: {
      type: Boolean,
      default: null,
    },
    firstTxTotalBribe: {
      type: Number,
      default: 0.0
    },
    firstTxTotalFee: {
      type: Number,
      default: 0.0
    },
    firstTxTotalEth: {
      type: Number,
      default: 0.0
    },
    firstReserveWeth: {
      type: Number,
      require: true,
      default: -1.0,
    },
    beforeAttacked: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("tokenStructure", tokensSchema);

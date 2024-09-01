import mongoose from "mongoose";

const attack1TokensSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
    },
    pair: {
      type: String,
      required: true,
      unique: true,
    },
    openTrading: {
      type: Boolean,
      required: true,
      default: false,
    },
    lockedBeforeSwap: {
      type: Boolean,
      required: true,
      default: false,
    },
    firstSwapBlockNumber: {
      type: Number,
      require: true,
      default: -1,
    },
    maxSwapTokenAmount: {
      type: Number,
      require: true,
      default: -1,
    },
    firstReserveToken: {
      type: Number,
      require: true,
      default: -1.0,
    },
    firstReserveWeth: {
      type: Number,
      require: true,
      default: -1.0,
    },
    lastReserveToken: {
      type: Number,
      require: true,
      default: -1.0,
    },
    lastReserveWeth: {
      type: Number,
      require: true,
      default: -1.0,
    },
    limit: {
      type: Number,
      required: true,
      default: -1.0,
    },
    price: {
      type: Number,
      required: true,
      default: -1.0,
    },
    firstSwapTotalBribe: {
      type: Number,
      required: true,
      default: 0.0,
    },
    sniped: {
      type: Number,
      required: true,
      default: 0,
    },
    nonce0: {
      type: Number,
      required: true,
      default: 0,
    },
    snipers: {
      type: Number,
      required: true,
      default: 0,
    },
    firstSwapAtAsiaTime: {
      type: Boolean,
      required: true,
      default: false,
    },
    bought: {
      type: Boolean,
      required: true,
      default: false,
    },
    profitLevel: {
      type: Number,
      required: true,
      default: 0,
    },
    firstSwapVerified: {
      type: Number,
      required: true,
      default: false,
    },
  }
);

export default mongoose.model("attack1Tokens", attack1TokensSchema);

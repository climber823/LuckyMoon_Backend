import mongoose from "mongoose";

const limitTokensSchema = new mongoose.Schema(
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
    firstSwapBlockNumber: {
      type: Number,
      require: true,
      default: -1,
    },
    limit: {
      type: Boolean,
      required: true,
      default: false,
    }
  }
);

export default mongoose.model("limitTokens", limitTokensSchema);

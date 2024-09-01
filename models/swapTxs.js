import mongoose from "mongoose";

const swapTxsSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
    },
    txHash: {
      type: String,
      require: true,
      unique: true
    },
    from : {
      type: String,
    },
    to : {
      type: String
    },
    blockNumber: {
      type: Number
    },
    value: {
      type: Number
    },
    maxPriorityFeePerGas: {
      type: Number
    },
    percentForTS: {
      type: Number
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("swapTxsStructure", swapTxsSchema);

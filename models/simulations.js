import mongoose from "mongoose";

const feeStructureSchema = new mongoose.Schema(
  {
    feeMethod: {
      type: String
    },
    feeMethodVariableCount: {
      type: Number
    },
    feeMethodVariablePos: {
      type: Number
    },
    feeMethodLowBound: {
      type: Number
    },
    feeMethodFeeChangeRate: {
      type: Number
    }
  }
);

const simulationSchema = new mongoose.Schema(
  {
    address: {
      type: String,
    },
    blockNumber: {
      type: Number,
    },
    maxSwapPercent: {
      type: Number
    },
    maxBuyPercent: {
      type: Number
    },
    maxSellPercent: {
      type: Number
    },
    maxWalletSize: {
      type: Number
    },
    addLiquidity : {
      type: Boolean
    },
    enableMethod : {
      type: String,
    },
    enableMethodVariables: {
      type: Array,
    },
    buyTax: {
      type: Number,
    },
    sellTax: {
      type: Number,
    },
    transferTax: {
      type: Number,
    },
    isBulkTestSuccess: {
      type: Boolean,
    },
    isTransferDelay: {
      type: Boolean,
    },
    deadBlockCount : {
      type: Number,
      default: -1,
    },
    feeStructures: [feeStructureSchema],
    totalLog : {
      type: String
    },
    swapBackPercentage: {
      type: Number
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("simulationStructure", simulationSchema);

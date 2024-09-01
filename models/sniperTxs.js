import mongoose from "mongoose";

const sniperTxsSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
    },
    txHash: {
      type: String,
      require: true,
    },
    from : {
      type: String,
    },
    to : {
      type: String
    },
    nonce : {
      type: Number
    },
    priorityFee: {
      type: Number
    },
    gasLimit: {
      type: Number
    }, 
    gasUsed: {
      type: Number
    },
    gasFee: {
      type: Number
    },
    value: {
      type: Number
    },
    bribe: {
      type: Number
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("sniperTxsStructure", sniperTxsSchema);

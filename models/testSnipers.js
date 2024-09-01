import mongoose from "mongoose";

const testSnipersSchema = new mongoose.Schema(
  {
    pair: {
      type: String,
      required: true,
      unique: true,
    },
    blockNumber: {
      type: Number,
      require: true,
    },
    sniperCount: {
      type: Number,
      default: 0,
    },
  }
);

export default mongoose.model("testSnipers", testSnipersSchema);

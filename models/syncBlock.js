import mongoose from "mongoose";

const syncBlockSchema = new mongoose.Schema(
  {
    block: {
        type: Number,
        required: true,
    },
    tx: {
        type: Number
    }
});

export default mongoose.model("syncBlock", syncBlockSchema);

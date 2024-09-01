// import { createRequire } from "module";
import mongoose from "mongoose";
// const require = createRequire(import.meta.url);
import dotenv from "dotenv";
dotenv.config();

export const connectDB = async () => {
  try {
    mongoose.connect(process.env.mongoURL, {
      useUnifiedTopology: true,
    });

    console.log("MongoDB Connected...");
  } catch (err) {
    console.error(err.message);
    // Exit process with failure
    process.exit(1);
  }
};

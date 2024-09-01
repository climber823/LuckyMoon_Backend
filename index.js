import { initData, analyze } from "./analyze.js";
import {connectDB} from "./config/db.js";
// import {update} from "./update.js";
// import { find } from "./find.js";
// import { FindLimit } from "./findLimit.js";
// import { attack1 } from "./attack1.js";
// import { findLockBeforeSwap } from "./findLockBeforeSwap.js";
// import { findMevContract } from "./findMevContract.js";
// import {io} from "./global/socketIO.js";

const main = async () => {
  // Add timestamp to all subsequent console.logs
  // One little two little three little dependency injections....
  const origLog = console.log;
  console.log = function (obj, ...placeholders) {
    if (typeof obj === "string")
      placeholders.unshift("[" + new Date().toISOString() + "] " + obj);
    else {
      // This handles console.log( object )
      placeholders.unshift(obj);
      placeholders.unshift("[" + new Date().toISOString() + "] %j");
    }

    origLog.apply(this, placeholders);
  };

  connectDB();
  // real api!
  // attack1(); // Detect and Attack more than 80 sniped tokens

  await initData()

  analyze();
  // update();
  // find();
  // FindLimit();
  // findLockBeforeSwap()
  // findMevContract()
};
 
main();

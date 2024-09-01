// Globals
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { logError } from "./logging.js";
import {calcNextBlockBaseFee} from "./utils.js";
import IERC20ABI from "./abi/IERC20.js";

import IUniswapV2PairAbi from "./abi/IUniswapV2Pair.js";
import IUniswapV2RouterAbi from "./abi/IUniswapV2Router02.js";

export const IUniV2RouterInterface = new ethers.utils.Interface(IUniswapV2RouterAbi);

export const UniV2RouterInterfaceIds = {
  '0xfb3bdb41': 'swapETHForExactTokens',
  '0xb6f9de95': 'swapExactETHForTokensSupportingFeeOnTransferTokens'
}

export const getBlockTimestamp = async (blockNumber) => {
  try {
      const block = await wssProvider.getBlock(blockNumber);
      if (block && block.timestamp) {
          const timestamp = block.timestamp;
          const date = new Date(timestamp * 1000); // Convert UNIX timestamp to JavaScript Date
          return date;
      } else {
          console.log(`Block not found: ${blockNumber}`);
          return -1;
      }
  } catch (error) {
      console.error(`Error fetching block: ${error}`);
      return -1;
  }
}

// Contracts
export const CONTRACTS = {
  UNIV2_ROUTER: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
  UNIV32_ROUTER: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  UNIV2_FACTORY: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
  DEAD: "0x0000000000000000000000000000000000000000",
  DEAD2: "0x000000000000000000000000000000000000dead"
};

// Helpful tokens for testing
export const TOKENS = {
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
};

export const httpProvider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL
);

export const wssProvider = new ethers.providers.WebSocketProvider(
  process.env.RPC_URL_WSS
);

// Common contracts
export const uniswapV2Pair = new ethers.Contract(
  ethers.constants.AddressZero,
  IUniswapV2PairAbi,
  wssProvider
);

export const uniswapV2Router = new ethers.Contract(
  CONTRACTS.UNIV2_ROUTER,
  IUniswapV2RouterAbi,
  wssProvider
);

export const IERC20 = new ethers.Contract(
  ethers.constants.AddressZero,
  IERC20ABI,
  wssProvider
)

export const mevBots = [
  {address: "0xec2f98f55d8785096a16eef6b8a9fefd0b91294e", pos: 1},
  {address: "0xe5bba2bde7d4192d4b986e9e87a39f0c0dadeb38", pos: 7},
  {address: "0xa5a7fca2fc5fa110568f243cab0163814a07bdb6", pos: 0},
  {address: "0x8f1b1C6DC17566eAb08ED23EDe07cB478989D19C", pos: 3},
  {address: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", pos: 2},
  {address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", pos: 14},
  {address: "0x7E2C180bAd29162B44F1fB35211B7c3F62EBd2b2", pos: 0}
]
export const TOKEN_LIST_SEND_SIZE = 500
export const NONCE_SMALL_LEVEL = 3
export const NONCE_HIGH_LEVEL = 1000
export const SAME_DELTA = 0.000000001
export const FILTER_NONCE_COUNT= 0
export const FILTER_SNIPED_COUNT= 5
export const FILTER_SNIPERS_COUNT= 1
export const SNIPER_NUMBER_MIN = 10
export const NONCE0_MIN = 10
export const NONCE0_OWNER_DELTA = 3
export const WALLET_NUMBER_MIN = 7
export const MAX_NUMBER = 999999999
export const DOUBLE_SNIPER_WALLET = 7
export const MEV_MIN_COUNT = 80
export const MEV_SEARCH_STEP = 100
export const CHECK_BEFORE_SWAP_BLOCK_COUNT = 1000
export const CHECK_BEFORE_SWAP_MIN = 1
export const CAN_FOLLOW_WALLET_BLOCK_COUNT = 1
export const CAN_FOLLOW_WALLET_BLOCK_COUNT_SEQUENCE = 5
export const ANALYZE_BLOCK_COUNT = 100;


export const APIKEY = 'H149MYX2CAY1ZEMNGWC4E5RY7V9GKY9VU1'

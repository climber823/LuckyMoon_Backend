import tokenStructure from "../models/tokens.js";
import simulationStructure from "../models/simulations.js";
import sniperTxsStructure from "../models/sniperTxs.js";
import abiDecoder from "abi-decoder"
import ethers from "ethers";
import { wssProvider, NONCE_HIGH_LEVEL, NONCE_SMALL_LEVEL, SAME_DELTA, uniswapV2Pair, FILTER_NONCE_COUNT, MAX_NUMBER,
  FILTER_SNIPERS_COUNT, SNIPER_NUMBER_MIN, NONCE0_MIN, NONCE0_OWNER_DELTA, WALLET_NUMBER_MIN, DOUBLE_SNIPER_WALLET, TOKENS, APIKEY, 
  httpProvider} from "../src/constants.js";
import IERC20ABI from "../src/abi/IERC20.js";
import IUniswapV2Pair from "../src/abi/IUniswapV2Pair.js";
import IUniswapV2Factory from "../src/abi/IUniswapV2Factory.js";
import ITeamFinanceLock from "../src/abi/ITeamFinance.js";
import IUnicrypt from "../src/abi/IUnicrypt.js";
import IPinkLock from "../src/abi/IPinkLock.js";
import { getUniv2PairAddress } from "../src/univ2.js";
import { match } from "../src/utils.js";
import testSnipers from "../models/testSnipers.js";
import limitTokens from "../models/limitTokens.js";

abiDecoder.addABI(IERC20ABI);
abiDecoder.addABI(IUniswapV2Pair);
abiDecoder.addABI(IUniswapV2Factory);
abiDecoder.addABI(ITeamFinanceLock);
abiDecoder.addABI(IUnicrypt);
abiDecoder.addABI(IPinkLock);

export const attack1 = async (req, res) => {
  try {
    // const { token, pair, walletCount, value, maxPriorityFee } = req.body;
    const data = req.body
    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      error: e.message,
    });
  }
};

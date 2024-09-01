import { ethers } from "ethers";
import { uniswapV2Pair } from "./constants.js";
import { match } from "./utils.js";
import { uniswapV2Router } from "./constants.js";
import { TOKENS } from "./constants.js";

/*
  Sorts tokens
*/
export const sortTokens = (tokenA, tokenB) => {
  if (ethers.BigNumber.from(tokenA).lt(ethers.BigNumber.from(tokenB))) {
    return [tokenA, tokenB];
  }
  return [tokenB, tokenA];
};

/*
  Computes pair addresses off-chain
*/
export const getUniv2PairAddress = (parameters) => {
  const { tokenA, tokenB } = parameters;
  const [token0, token1] = sortTokens(tokenA, tokenB);

  const salt = ethers.utils.keccak256(token0 + token1.replace("0x", ""));
  const address = ethers.utils.getCreate2Address(
    "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Factory address (contract creator)
    salt,
    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" // init code hash
  );

  return address;
};

/*
  Get reserve helper function
*/
export const getUniv2Reserve = async (parameters) => {
  const {pair, tokenA, tokenB} = parameters;
  const [token0] = sortTokens(tokenA, tokenB);
  let reserve0, reserve1;
  try{
    [reserve0, reserve1] = await uniswapV2Pair.attach(pair).getReserves();
  } catch(e) { 
    [reserve0, reserve1] = [0, 0];
  }

  if (match(tokenA, token0)) {
    return [reserve0, reserve1];
  }
  return [reserve1, reserve0];
};


export const getUniv2DataGivenOut = (bOut, reserveA, reserveB) => {
  // Underflow
  let newReserveB = reserveB.sub(bOut);
  if (newReserveB.lt(0) || reserveB.gt(reserveB)) {
    newReserveB = ethers.BigNumber.from(1);
  }

  const numerator     = reserveA.mul(bOut).mul(1000);
  const denominator   = newReserveB.mul(997);
  const aAmountIn     = numerator.div(denominator).add(ethers.constants.One);

  // Overflow
  let newReserveA = reserveA.add(aAmountIn);
  if (newReserveA.lt(reserveA)) {
    newReserveA = ethers.constants.MaxInt256;
  }

  return {
    amountIn: aAmountIn,
    newReserveA,
    newReserveB,
  };
};


export const getTxLimit = async (address, totalSupply) => {
  if(!totalSupply._isBigNumber) totalSupply = ethers.BigNumber.from(totalSupply.toString())
  
  let high = 10.0, low = 0.0
  let path = [TOKENS.WETH, address]; // First address is WETH
  
  while(high - low > 0.1) {
    let mid = 0.5 * (low + high)
    let percentageFactor = ethers.utils.parseUnits(mid.toString(), 18) // 1e18
    let amountOut = totalSupply.mul(percentageFactor).div('100000000000000000000'); // divide by 1e20
    let result = -1

    try {
      // Call the swapETHForExactTokens function using callStatic
      await uniswapV2Router.callStatic.swapETHForExactTokens(
        amountOut,
        path,
        "0x34514D943FC4582C628eA05eaA4447D8b1517449",
        10000000000000,
        {
          value: ethers.utils.parseEther("100.0")
        }
      );
      result = 1
    } catch (error) {
      if (error && error.message.includes("EXCESSIVE_INPUT_AMOUNT")) {
        result = 0; // Indicates the amountOut is too high
      }
      if (error && error.message.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
        result = 0; // Indicates the amountOut is too high
      }
      if (error && error.message.includes("ds-math-sub-underflow")) {
        result = 0; // Indicates the amountOut caused underflow
      }
      // throw error; // Unexpected error
      result = -1;
    }
    // console.log("mid::::::::::::::::::::::::::::", mid)

    if (result) low = mid
    else high = mid
  }
  
  return high
}
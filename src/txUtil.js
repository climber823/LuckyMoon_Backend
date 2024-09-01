import {CAN_FOLLOW_WALLET_BLOCK_COUNT, CAN_FOLLOW_WALLET_BLOCK_COUNT_SEQUENCE, CONTRACTS, httpProvider, IERC20, TOKENS} from './constants.js'


import tokenStructure from "../models/tokens.js";
import { hasSwapedTxsInLastBlocks } from './swapTxUtil.js';
import {ethers} from 'ethers'
import { isSequence } from './utils.js';
import { getUniv2PairAddress } from './univ2.js';

//analyze internal transactions for detecting swap
export const analyzeInternalTxns = async (hash, pair) => {
    const res = await httpProvider.send("debug_traceTransaction", 
                      [hash, { tracer: 'callTracer', tracerConfig: { withLog: false } }])
  
    if(res.to === CONTRACTS.UNIV2_ROUTER) return true
    
    if(res.calls === undefined) return false
    
    for(const log of res.calls) {
      if(log.to === CONTRACTS.UNIV2_ROUTER) return true
      if(log.to === pair) return true
    }
  
    return false
}

// detect if this transaction is swap?
export const isSwapEvent = async ({tx, blockNumber}) => {
    if(!tx.to || tx.to === undefined) return {isSwap: false, token: null}

    const tokens = await tokenStructure.aggregate([
        {
            $match: {
                // liquidityToken: {$ne: null},  // add liqudity
                // pair: {$ne: null},  // pair created
                firstSwapBlockNumber: null    // swap
            }
        }, {
            $project: {
                _id: 0,
                pair: 1,
                address: 1
            }
        }
    ])

    
    for(const token of tokens) {
        const tok = token.address.toLowerCase().slice(2)
        let pair = (token.pair === undefined) ? getUniv2PairAddress({tokenA: token.address, tokenB: TOKENS.WETH}): token.pair
        pair = pair.toLowerCase().slice(2)
    
        if(tx.to.toLowerCase() === CONTRACTS.UNIV2_ROUTER.toLowerCase()) {
            if(!tx.data.includes(tok)) continue
            return {isSwap: true, token: '0x' + tok}
        }

        if(!tx.data.includes(tok) && !tx.data.includes(pair)) continue  // not for targeting token or pair
        
        const isSwap = await analyzeInternalTxns(tx.hash, '0x' + pair)
        if(!isSwap) continue  // not for swap

        return {isSwap: true, token: '0x' + tok}
    }

    return {isSwap: false, token: null}
}

export const getPercentForTotalSupply = async(ca, data) => {
    const decrypted = data.slice(10, data.length)
    const totalSupply = await IERC20.attach(ca).totalSupply();
    let offset = 0
    let percents = []

    while(1) {
        const snippet = decrypted.slice(offset, offset + 64)
        if(snippet.length < 64) break
        offset += 64
        let id = 0
        while(id < snippet.length && snippet[id ++] === '0'){}
        if((snippet.length - id + 1) >= 30) continue // contract address
        
        const value = ethers.BigNumber.from('0x' + snippet.slice(id - 1, snippet.length))
        const percent = Number(value.mul(100000).mul(100).div(totalSupply)) / 100000
        
        if(percent <= 0 || percent > 10) continue
        percents.push(percent)
    }

    if(percents.length === 0) return 0
    return Math.max(...percents)
}

//detect whether I follow this wallet
export const canIFollowThisWallet = async ({wallet, token, blockNumber}) => {
    // const blocks = hasSwapedTxsInLastBlocks(wallet, token, blockNumber)
    // const isSequenceBlock = blocks.length >= CAN_FOLLOW_WALLET_BLOCK_COUNT_SEQUENCE && isSequence(blocks)
    // return isSequenceBlock
    const wallets = hasSwapedTxsInLastBlocks(wallet, token, blockNumber)
    return wallets >= CAN_FOLLOW_WALLET_BLOCK_COUNT
}

//detect whether this token is honeypot
export const isHoneyPot = async ({token, pair}) => {
    const fetchURL = `https://api.honeypot.is/v2/IsHoneypot?address=${token}&pair=${pair}&chainID=1`;
    const isHoney = await fetch(fetchURL).then(res => res.json()).then(json => {
        const simulationResult = json.simulationResult
        if(simulationResult === undefined)  return true
        const sellTax = simulationResult.sellTax
        if(sellTax > 50) return true
        return false
    });

    return isHoney
}

//emit buy event to the bot
export const emitBuyEvent = ({token, blockNumber}) => {
    console.log("emit buy event----", token, blockNumber)
}

//emit what
export const emitCancelBuyEvent = () => {
}
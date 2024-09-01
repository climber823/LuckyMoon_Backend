import {CAN_FOLLOW_WALLET_BLOCK_COUNT, CHECK_BEFORE_SWAP_BLOCK_COUNT, CHECK_BEFORE_SWAP_MIN} from "./constants.js";

let swapedTxs = [];

export const addSwapedTxs = (Txs) => {
    if(getSwapedTxsByHash(Txs.txHash) > -1) return 
    swapedTxs.push(Txs);
}

export const getSwapedTxs = () => {
    return swapedTxs;
}

export const clearSwapedTxs = () => {
    swapedTxs = [];
}

export const getSwapedTxsLength = () => {
    return swapedTxs.length;
}

export const getSwapedTxsAt = (index) => {
    return swapedTxs[index];
}

export const getSwapedTxsByHash = (hash) => {
    return swapedTxs.findIndex((s) => s.txHash === hash)
}

export const hasSwapedTxs = (token, blockNumber) => {
    const filters = swapedTxs.filter(tx => (tx.blockNumber >= (blockNumber - 1 - CHECK_BEFORE_SWAP_BLOCK_COUNT)) && (tx.blockNumber <= blockNumber - 1))
                    .filter((tx) => tx.token === token)
    return filters.length > CHECK_BEFORE_SWAP_MIN
}

export const hasSwapedTxsInLastBlocks = (wallet, token, blockNumber) => {
    // let filters = swapedTxs.filter(tx => (tx.blockNumber >= (blockNumber - CAN_FOLLOW_WALLET_BLOCK_COUNT)) && (tx.blockNumber <= blockNumber))
    //                 .filter((tx) => tx.token === token && tx.from === wallet).map((tx) => tx.blockNumber)

    let filters = swapedTxs.filter(tx => tx.token === token).map(tx => tx.from)
    filters = [...new Set(filters)];
    return filters.length
}
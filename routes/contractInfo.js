import { Router } from 'express';

import { getSnipersAnlaysis, getdetectedSwapForWallet, getdetectedSwapForToken, getDetectedSwapLogs, getNoOneFirstBuyMevTokens, getSwapMevTokens, getOpenTradingMevTokens, getTransferMevTokens, getMevTokens, setProfitValue, deleteUselessTokens, getAttack1Tokens, getLimitTokens, getBigSniper, getPlotInfo, getContractInfo, getContractInfoByPair, setContractLevel, deleteSwappedTokens, deleteLockedTokens, deleteOldTokens, deleteLevel1Tokens, getBlockTxnsForTokens, setGasFeeOnSnipingTxns, getFilteredMevTokensApi, getFilteredTokensTest, getFilteredTokensApi, getFilteredBribetokensApi, getFilteredNonceTokensApi, getFilteredWalletTokensApi } from '../controllers/contractInfo.js';

export const contractInfoRouter = Router();

contractInfoRouter.get('/', getContractInfo);
contractInfoRouter.get('/pair', getContractInfoByPair);
contractInfoRouter.get('/txns', getBlockTxnsForTokens);
contractInfoRouter.get('/filter', getFilteredTokensApi);
contractInfoRouter.get('/filterMev', getFilteredMevTokensApi);
contractInfoRouter.get('/filterNonce', getFilteredNonceTokensApi);
contractInfoRouter.get('/filterBribe', getFilteredBribetokensApi);
contractInfoRouter.get('/filterWallet', getFilteredWalletTokensApi);
contractInfoRouter.get('/test', getFilteredTokensTest);
contractInfoRouter.post('/setTokenLevel', setContractLevel);
contractInfoRouter.post('/saveProfit', setProfitValue);
contractInfoRouter.post('/deleteSwappedTokens', deleteSwappedTokens);
contractInfoRouter.post('/deleteLockedTokens', deleteLockedTokens);
contractInfoRouter.post('/deleteOldTokens', deleteOldTokens);
contractInfoRouter.post('/deleteLevel1Tokens', deleteLevel1Tokens);
contractInfoRouter.post('/setGasFeeForSnipers', setGasFeeOnSnipingTxns)

contractInfoRouter.get('/getdetectedSwap', getDetectedSwapLogs)
contractInfoRouter.get('/getdetectedSwapForToken', getdetectedSwapForToken)
contractInfoRouter.get('/getdetectedSwapForWallet', getdetectedSwapForWallet)
contractInfoRouter.get('/analyzeSniper', getSnipersAnlaysis);

contractInfoRouter.get('/plot', getPlotInfo);
contractInfoRouter.get('/bigsniper', getBigSniper);
contractInfoRouter.get('/limitTokens', getLimitTokens);
contractInfoRouter.get('/attack1Tokens', getAttack1Tokens);
contractInfoRouter.get('/mevTokens', getMevTokens);
contractInfoRouter.get('/transferMevTokens', getTransferMevTokens);
contractInfoRouter.get('/openTradingMevTokens', getOpenTradingMevTokens);
contractInfoRouter.get('/noOneFirstBuyMevTokens', getNoOneFirstBuyMevTokens);
contractInfoRouter.get('/swapMevTokens', getSwapMevTokens);
contractInfoRouter.post('/deleteUselessTokens', deleteUselessTokens);
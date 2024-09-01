import simulationStructure from "../models/simulations.js";

const convertStringToIntArray = (inputString) => {
  inputString = inputString.replace(/\[/g, "");
  inputString = inputString.replace(/\]/g, "");
  inputString = inputString.replace(/ /g, "");
  let items = inputString.split(",");

  let results = [];

  for (let i = 0; i < items.length; ++i) {
    results.push(parseInt(items[i]));
  }
  return results;
};

export const addSimulationResult = async (req, res) => {
  try {
    const requestData = req.body;
    console.log({requestData});
    // const enableMethodArray = convertStringToIntArray(requestData.enableMethodVariables);
    await simulationStructure.create({
      address: requestData.address.toLowerCase(),
      blockNumber: requestData.blockNumber,
      maxSwapPercent: requestData.maxSwapPercent,
      addLiquidity: requestData.addLiquidity,
      enableMethod: requestData.enableMethod,
      enableMethodVariables: requestData.enableMethodVariables,
      buyTax: requestData.buyTax,
      sellTax: requestData.sellTax,
      transferTax: requestData.transferTax,
      isBulkTestSuccess: requestData.isBulkTestSuccess,
      isTransferDelay: requestData.isTransferDelay,
      totalLog: requestData.totalLog,
      swapBackPercentage: parseFloat(requestData.swapBackPercentage)
    });
    res.status(200).json({
      success: true,
    });
  } catch (e) {
    console.log(e);
    res.status(400);
  }
};

export const setDeadBlockCount = async (req, res) => {
  try {
    const requestData = req.body;
    const addressOfResult = requestData.address.toLowerCase();
    const blockNumberOfResult = requestData.blockNumber;
    const enableMethodOfResult = requestData.enableMethod;
    const simulationResult = await simulationStructure.findOne({
      address: addressOfResult,
      blockNumber: blockNumberOfResult,
      enableMethod: enableMethodOfResult,
    });
    simulationResult.deadBlockCount = requestData.deadBlockCount;
    simulationResult.save();
    res.status(200).json({
      success: true,
    });
  } catch (e) {
    console.log(e);
    res.status(400);
  }
};

export const addFeeResult = async (req, res) => {
  try {
    const requestData = req.body;
    const addressOfResult = requestData.address.toLowerCase();
    const blockNumberOfResult = requestData.blockNumber;
    const enableMethodOfResult = requestData.enableMethod;
    const simulationResult = await simulationStructure.findOne({
      address: addressOfResult,
      blockNumber: blockNumberOfResult,
      enableMethod: enableMethodOfResult,
    });
    console.log(simulationResult);
    const feeStructures =
      simulationResult.feeStructures == null
        ? []
        : simulationResult.feeStructures;
    const feeStructure = {
      feeMethod: requestData.feeMethod,
      feeMethodVariableCount: requestData.feeMethodVariableCount,
      feeMethodVariablePos: requestData.feeMethodVariablePos,
      feeMethodLowBound: requestData.feeMethodLowBound,
      feeMethodFeeChangeRate: requestData.feeMethodFeeChangeRate,
    };
    console.log(feeStructure);
    feeStructures.push(feeStructure);
    simulationResult.save();
    res.status(200).json({
      success: true,
    });
  } catch (e) {
    console.log(e);
    res.status(400);
  }
};

import tokenStructure from "../models/tokens.js";
import simulationStructure from "../models/simulations.js";
import axios from "axios";
import {sleep} from "./utils.js";
import fetch from 'node-fetch';
import {io} from "../global/socketIO.js";

export const requestSimulationForNewContract = async (blk) => {
    const createdContracts = await tokenStructure.find({blockNumber: blk - 6});
    
    // console.log("Simulate newly created contract", createdContracts.length);
    for(let i = 0 ; i < createdContracts.length ; ++ i) {
        const fetchData = {
            contractAddress: createdContracts[i].address,
            ownerAddress: createdContracts[i].owner,
            totalSupply: createdContracts[i].totalSupply,
            startBlockNumber: createdContracts[i].blockNumber,
        }

        const response = await axios({
            // Enter your IP address here
            method: "POST",
            url: "http://127.0.0.1:5001/check",
            headers: {
            "Content-Type": "application/json",
            },
            data: JSON.stringify(fetchData), // body data type must match "Content-Type" header
        });

        console.log(response);
        // Send simulation data to the frontend
        const newlyCreatedSimulationResult = await simulationStructure.find({"address": createdContracts[i].address, "blockNumber": createdContracts[i].blockNumber});
        io.emit("simulationCreated", newlyCreatedSimulationResult);
    }
};

export const getVerifiedContract = async (blk) => {
    const unverifiedContracts = await tokenStructure.find({
        blockNumber: {$gt: blk - 60 * 5},
        $or: [{contractSourceCode: {$exists: false}}, {contractSourceCode: ""}]
    }).sort({"createdAt": -1});
    console.log("Unverified contract count:", unverifiedContracts.length);
    const startGetResponseTime = Date.now();

    // If length is less than 5
    if(unverifiedContracts.length < 5) {
        for(let i = 0 ; i < unverifiedContracts.length ; ++ i) {
            const fetchURL = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${unverifiedContracts[i].address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`;
            await fetch(fetchURL).then(res => res.json()).then(json => {
                unverifiedContracts[i].contractSourceCode = json.result[0].SourceCode;
                unverifiedContracts[i].contractABI = json.result[0].ABI;
                unverifiedContracts[i].save();
            });
        }
        return;
    }

    // If length is more than 5
    const checkContractCount = Math.floor(unverifiedContracts.length / 5) > 8 ? 8 : Math.floor(unverifiedContracts.length / 5);
    for(let i = 0 ; i < checkContractCount ; ++ i) {
        const startTime = Date.now();
        let jsonResponse = [5];
        {[jsonResponse[0], jsonResponse[1], jsonResponse[2], jsonResponse[3], jsonResponse[4]] = await Promise.all([
            fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${unverifiedContracts[i * 5].address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`),
            fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${unverifiedContracts[i * 5 + 1].address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`),
            fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${unverifiedContracts[i * 5 + 2].address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`),
            fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${unverifiedContracts[i * 5 + 3].address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`),
            fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${unverifiedContracts[i * 5 + 4].address}&apikey=E4DKRHQZPF2RVBXC6G2IBP56PJFFBITYVA`),
        ])}
        for(let j = 0 ; j < 5 ; ++ j) {
            const responseResult = (await jsonResponse[j].json());
            // console.log({responseResult});
            unverifiedContracts[i * 5 + j].contractSourceCode = responseResult.result[0].SourceCode;
            unverifiedContracts[i * 5 + j].contractABI = responseResult.result[0].ABI;
            unverifiedContracts[i * 5 + j].save();

            if(responseResult.result[0].SourceCode != "") {
                const verifiedContractStructure = {
                    address: unverifiedContracts[i * 5 + j].address,
                    sourceCode: responseResult.result[0].SourceCode,
                    contractABI: responseResult.result[0].ABI
                };

                io.emit("contractVerified", verifiedContractStructure);
            }
        }
        const deltaTime = Date.now() - startTime;

        // If total consume time take over 10.2s we need to return so that the next get verification part will run alone.
        if(Date.now() - startGetResponseTime > 10200) return;

        // We should wait totally 1s to use API only 5 times.
        if(deltaTime < 1000) await sleep(1000 - deltaTime);
    }
}

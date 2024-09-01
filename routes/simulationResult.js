import { Router } from 'express';

import {
    addSimulationResult,
    addFeeResult,
    setDeadBlockCount,
} from '../controllers/simulationResult.js';

export const simulationResult = Router();

simulationResult.post('/addSimulationResult', addSimulationResult);
simulationResult.post('/setDeadBlockCount', setDeadBlockCount);
simulationResult.post('/addFeeResult', addFeeResult);
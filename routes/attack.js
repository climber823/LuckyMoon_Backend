import { Router } from 'express';

import { attack1 } from '../controllers/attack.js';

export const attackRouter = Router();


attackRouter.post('/no1', attack1)
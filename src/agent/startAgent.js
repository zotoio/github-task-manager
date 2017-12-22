import { default as dotenv } from 'dotenv';
dotenv.config();

import { Agent } from './Agent';

(() => {
    let agent = new Agent();
    agent.start();
})();

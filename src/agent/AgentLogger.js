import { default as bunyan } from 'bunyan';
import { default as bformat } from 'bunyan-format';
import { default as createCWStream } from 'bunyan-cloudwatch';
import { default as UUID } from 'uuid/v4';
import { default as ExpressSSE } from 'express-sse';
import { default as dotenv } from 'dotenv';
dotenv.config();

let SSE = new ExpressSSE();
let AGENT_ID = UUID();

let LOG = create(AGENT_ID, SSE);

function create(agentId, sse) {

    if (!agentId) console.warn('agentId is not set.');
    if (!sse) console.warn('sse is not set.');

    let stream = createCWStream({
        logGroupName: process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP || 'gtmAgent',
        logStreamName: 'AGENT_ID=' + agentId,
        cloudWatchLogsOptions: {
            region: process.env.GTM_AWS_REGION
        }
    });

    let log = bunyan.createLogger({
        name: agentId.substring(0, 7),
        streams: [
            {
                stream: stream,
                type: 'raw'
            },
            {
                stream: bformat({outputMode: 'short'}),
            },
            /*{
                stream: sse,
                reemitErrorEvents: true
            }*/
        ]
    });

    LOG = log;

    return LOG;
}

function log() {
    return LOG;
}

module.exports.log = log;
module.exports.AGENT_ID = AGENT_ID;
module.exports.SSE = SSE;
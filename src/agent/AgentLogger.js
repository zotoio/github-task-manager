import { default as bunyan } from 'bunyan';
import { default as bformat } from 'bunyan-format';
import { default as createCWStream } from 'bunyan-cloudwatch';
import { default as UUID } from 'uuid/v4';
import { default as ExpressSSE } from 'express-sse';
import { default as dotenv } from 'dotenv';
dotenv.config();

let SSE = [];
let AGENT_ID = UUID();
let STREAM = [];
let LOG = create(AGENT_ID);

let logGroupMap = [];
logGroupMap['gtmGithubHook'] = '/aws/lambda/gtmGithubHook-dev-gtmGithubHook';
logGroupMap['gtmGithubResults'] = '/aws/lambda/gtmGithubHook-dev-gtmGithubResults';
logGroupMap[process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP] = process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP;

let CWLogFilterEventStream = require('smoketail').CWLogFilterEventStream;

function create(agentId) {

    if (!agentId) console.warn('agentId is not set.');

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
            }
        ]
    });

    LOG = log;

    return LOG;
}

function log() {
    return LOG;
}

// important - do not use log() in this fn or a cloudwatch loop can occur :)
function stream(groupName, streamName) {

    console.log('cloudwatch stream started (groupName: ' + groupName, 'streamName: ' + (streamName || 'ALL') + ')');

    if (!SSE[groupName]) {
        SSE[groupName] = new ExpressSSE();
    }

    let filterOpts = {
        logGroupName : logGroupMap[groupName],
        logStreamNames: streamName && streamName !== 'ALL' ? [streamName] : undefined,
        startTime: Date.now(),
        follow: true
    };

    let awsOpts = {
        region : process.env.GTM_AWS_REGION
    };

    STREAM[groupName] = new CWLogFilterEventStream(filterOpts, awsOpts);

    STREAM[groupName].on('error', (err) => {
        console.log(err);
    });

    STREAM[groupName].on('end', () => {
        console.log('The stream is over.');
    });

    STREAM[groupName].on('data', (eventObject) => {
        /* very noisy..
        console.debug(
            'Timestamp: ', new Date(eventObject.timestamp),
            'Message: ', eventObject.message
        );*/

        if (SSE[groupName]) {
            SSE[groupName].send(eventObject);
        }
    });

}

stream('gtmGithubHook');
stream('gtmGithubResults');
stream(process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP);

module.exports = {
    log: log,
    stream: stream,
    AGENT_ID: AGENT_ID,
    SSE: SSE
};
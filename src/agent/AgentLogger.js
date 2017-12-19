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
let STREAM_USER_LAST_ACTIVITY = Date.now();

let logGroupMap = [];
logGroupMap['gtmGithubHook'] = '/aws/lambda/gtmGithubHook-dev-gtmGithubHook';
logGroupMap['gtmGithubResults'] =
    '/aws/lambda/gtmGithubHook-dev-gtmGithubResults';
logGroupMap[process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP] =
    process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP;

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

    return bunyan.createLogger({
        name: agentId.substring(0, 7),
        streams: [
            {
                stream: stream,
                type: 'raw'
            },
            {
                stream: bformat({ outputMode: 'short' })
            }
        ]
    });
}

function log() {
    return LOG;
}

// important - do not use log() in this function, or a cloudwatch loop will occur :)
function stream(groupName, streamName) {
    console.log(
        `starting cloudwatch stream (groupName: ${groupName}, streamName: ${streamName ||
            'ALL'})`
    );

    if (!SSE[groupName]) {
        SSE[groupName] = new ExpressSSE();
    }

    let filterOpts = {
        logGroupName: logGroupMap[groupName],
        logStreamNames:
            streamName && streamName !== 'ALL' ? [streamName] : undefined,
        startTime: Date.now(),
        follow: true
    };

    let awsOpts = {
        region: process.env.GTM_AWS_REGION
    };

    if (STREAM[groupName]) {
        stopStream(groupName);
    }

    STREAM[groupName] = new CWLogFilterEventStream(filterOpts, awsOpts);

    STREAM[groupName].on('error', err => {
        console.log(err);
    });

    STREAM[groupName].on('end', () => {
        console.log(`${groupName} stream closed`);
    });

    STREAM[groupName].on('data', eventObject => {
        /*console.debug( // noisy!
            'Timestamp: ', new Date(eventObject.timestamp),
            'Message: ', eventObject.message
        );*/

        if (SSE[groupName]) {
            SSE[groupName].send(eventObject);
        }
    });
}

function stopAllStreams() {
    Object.keys(STREAM).forEach(group => {
        stopStream(group);
    });
}

function stopStream(group) {
    if (STREAM[group]) {
        console.log(`closing stream: ${group}`);
        STREAM[group].close();
        STREAM[group] = null;
    }
}

function registerActivity(ip) {
    STREAM_USER_LAST_ACTIVITY = Date.now();
    log().debug(`stream keepalive request from ${ip}..`);
}

function streamJanitor() {
    let maxMinutesInactivity = 2;
    //console.log(`streamJanitor ${Date.now()}, ${STREAM_USER_LAST_ACTIVITY}`);
    if (
        Object.keys(STREAM).length > 0 &&
        Date.now() - STREAM_USER_LAST_ACTIVITY >
            maxMinutesInactivity * 60 * 1000
    ) {
        log().info(
            `closing streams after no browsers detected for ${maxMinutesInactivity} minutes.`
        );
        stopAllStreams();
        clearInterval(janitorInterval);
    }
}
let janitorInterval = setInterval(streamJanitor, 60000);

module.exports = {
    log: log,
    stream: stream,
    stopStream: stopStream,
    stopAllStreams: stopAllStreams,
    registerActivity: registerActivity,
    AGENT_ID: AGENT_ID,
    SSE: SSE
};

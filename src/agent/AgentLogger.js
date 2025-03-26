import { default as bunyan } from 'bunyan';
import { default as bformat } from 'bunyan-format';
import { default as CWLogsWritable } from 'cwlogs-writable';
import { v4 as UUID } from 'uuid';
import { default as ExpressSSE } from 'express-sse';
import { default as proxy } from 'proxy-agent';
import { default as bunyanTcp } from 'bunyan-logstash-tcp';

let SSE = [];
let AGENT_ID = UUID();
let STREAM = [];
let LOG = process.env.NODE_ENV === 'test' ? console : create(AGENT_ID);
let STREAM_USER_LAST_ACTIVITY = Date.now();

let CWLogFilterEventStream = require('smoketail').CWLogFilterEventStream;
let janitorInterval;

function getLogGroupMap() {
    let logGroupMap = {};
    logGroupMap['gtmGithubHook'] = '/aws/lambda/gtmGithubHook-dev-gtmGithubHook';
    logGroupMap['gtmGithubResults'] = '/aws/lambda/gtmGithubHook-dev-gtmGithubResults';
    logGroupMap['gtmAgent'] = process.env.GTM_AGENT_CLOUDWATCH_LOGS_GROUP || 'gtmAgent';
    return logGroupMap;
}

function create(agentId) {
    if (!agentId) console.warn('agentId is not set.');

    let CWLogOptions = {
        region: process.env.GTM_AWS_REGION,
    };

    if (process.env.IAM_ENABLED) {
        CWLogOptions = {
            region: process.env.GTM_AWS_REGION,
            //accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            //secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            //sessionToken: process.env.AWS_SECURITY_TOKEN,
            httpOptions: {
                agent: proxy(process.env.HTTP_PROXY),
            },
        };
    }

    let cloudWatchStream = new CWLogsWritable({
        logGroupName: getLogGroupMap()['gtmAgent'],
        logStreamName: 'AGENT_ID=' + agentId,
        cloudWatchLogsOptions: CWLogOptions,
    }).on('error', console.error);

    janitorInterval = setInterval(streamJanitor, 60000);

    let bunyanConf = {
        name: agentId.substring(0, 7),
        streams: [
            {
                stream: cloudWatchStream,
                type: 'raw',
            },
            {
                stream: bformat({ outputMode: 'short' }),
            },
        ],
    };

    if (process.env.GTM_LOGSTASH_HOST) {
        let logstashPort = process.env.GTM_LOGSTASH_PORT || 5000;

        bunyanConf.streams.push({
            type: 'raw',
            stream: bunyanTcp
                .createStream({
                    host: process.env.GTM_LOGSTASH_HOST,
                    port: logstashPort,
                })
                .on('error', console.error),
        });
    }

    return bunyan.createLogger(bunyanConf);
}

function log() {
    return LOG;
}

// important - do not use log() in this function, or a cloudwatch loop will occur :)
function stream(groupName, streamName) {
    console.log(`starting cloudwatch stream (groupName: ${groupName}, streamName: ${streamName || 'ALL'})`);

    if (!SSE[groupName]) {
        SSE[groupName] = new ExpressSSE();
    }

    let filterOpts = {
        logGroupName: getLogGroupMap()[groupName],
        logStreamNames: streamName && streamName !== 'ALL' ? [streamName] : undefined,
        startTime: Date.now(),
        follow: true,
        followInterval: 5000,
    };

    let awsOpts = {
        region: process.env.GTM_AWS_REGION,
    };

    if (STREAM[groupName]) {
        stopStream(groupName);
    }

    STREAM[groupName] = new CWLogFilterEventStream(filterOpts, awsOpts);

    STREAM[groupName].on('error', (err) => {
        console.log(err);
    });

    STREAM[groupName].on('end', () => {
        console.log(`${groupName} stream closed`);
    });

    STREAM[groupName].on('data', (eventObject) => {
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
    Object.keys(STREAM).forEach((group) => {
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
    if (Object.keys(STREAM).length > 0 && Date.now() - STREAM_USER_LAST_ACTIVITY > maxMinutesInactivity * 60 * 1000) {
        log().info(`closing streams after no browsers detected for ${maxMinutesInactivity} minutes.`);
        stopAllStreams();
        clearInterval(janitorInterval);
    }
}

module.exports = {
    log: log,
    stream: stream,
    stopStream: stopStream,
    stopAllStreams: stopAllStreams,
    registerActivity: registerActivity,
    AGENT_ID: AGENT_ID,
    SSE: SSE,
};

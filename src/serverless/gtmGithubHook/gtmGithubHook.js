'use strict';

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

console.log('cold start');
require('source-map-support').install();
let rp = require('request-promise-native');
let json = require('format-json');
import { v4 as UUID } from 'uuid';
let Producer = require('sqs-producer');
let githubUtils = require('../gtmGithubUtils.js');

import KmsUtils from './../../KmsUtils';

async function listener(event, context, callback) {
    let sourceIp =
        event.requestContext && event.requestContext.identity ? event.requestContext.identity.sourceIp : 'unknown';
    let forwardedFor = event.headers['X-Forwarded-For'] || event.headers['x-forwarded-for'] || 'unknown';
    console.log(`hook call from ${sourceIp} forwarded for ${forwardedFor}`);
    const githubEvent = event.headers['X-GitHub-Event'] || event.headers['x-github-event'];
    const githubSignature = event.headers['X-Hub-Signature'] || event.headers['x-hub-signature'];
    let err = await githubUtils.invalidHook(event);
    if (err) {
        return callback(err, {
            statusCode: 401,
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(err),
        });
    }

    // decode and parse event body
    let eventBody = decodeEventBody(event);

    // blacklisted repos result in null error and 200 as this is a valid result
    err = checkRepoBlacklisted(eventBody);
    if (err) {
        return callback(err, {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(err),
        });
    }

    /* eslint-disable */
    console.log('---------------------------------');
    console.log(`Github-Event: "${githubEvent}"`);
    console.log('---------------------------------');
    console.log('Payload', json.plain(eventBody));
    /* eslint-enable */

    try {
        let ghEventId = await handleEvent(githubEvent, eventBody, githubSignature);
        return callback(null, {
            statusCode: 200,
            headers: { 'X-ghEventId': ghEventId },
            body: JSON.stringify({
                input: event,
            }),
        });
    } catch (e) {
        err = e;
        return callback(err, {
            statusCode: 400,
            headers: { 'Content-Type': 'text/plain' },
            body: err.message,
        });
    }
}

async function handleEvent(type, body, signature) {
    // collect config from github
    let taskConfig = await getTaskConfig(type, body);
    if (!taskConfig) {
        throw new Error(`No task config for event type ${type}`);
    }
    console.log(json.plain(taskConfig));

    // add event body to SQS
    console.log('adding event to SQS: ' + process.env.SQS_PENDING_QUEUE_URL);

    // create simple producer
    let producer = Producer.create({
        queueUrl: process.env.SQS_PENDING_QUEUE_URL,
        region: process.env.GTM_AWS_REGION,
    });
    let pushForPullRequest = false;
    // if this is a push, determine whether related to an open pull_request
    if (type === 'push' && body.commits.length > 0) {
        pushForPullRequest = await githubUtils.isCommitForPullRequest(body.commits[0].id);
    }
    body.pushForPullRequest = pushForPullRequest;
    let bodyString = JSON.stringify(body);
    let ghEventId = UUID();
    let ghAgentGroup = taskConfig[type] && taskConfig[type].agentGroup ? taskConfig[type].agentGroup : 'default';
    let event = [
        {
            id: ghEventId,
            body: bodyString,
            messageAttributes: {
                ghEventId: { DataType: 'String', StringValue: ghEventId },
                ghEventType: { DataType: 'String', StringValue: type },
                ghTaskConfig: {
                    DataType: 'String',
                    StringValue: json.plain(taskConfig),
                },
                ghAgentGroup: { DataType: 'String', StringValue: ghAgentGroup },
            },
        },
    ];

    signature = githubUtils.signRequestBody(
        await KmsUtils.getDecrypted(process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET),
        JSON.stringify(event[0]),
    );

    event[0].messageAttributes.ghEventSignature = {
        DataType: 'String',
        StringValue: signature,
    };

    console.log(`Outgoing event payload: ${json.plain(event)}`);

    producer.send(event, function (err) {
        if (err) console.log(err);
    });

    // set pull request status to pending for each task
    if (type === 'pull_request') {
        setPullRequestEventStatus(ghEventId, body);
    }
    return ghEventId;
}

async function getTaskConfig(type, body) {
    let fileParams = getFileParams(type, body);

    console.log(`file request params for ${type} = ${json.plain(fileParams)}`);

    let fileResponse = await githubUtils.getFile(fileParams).catch((e) => {
        console.warn(`Could not get taskConfig from GitHub: ${json.plain(fileParams)}, error is ${json.plain(e)}`);
        return rp({
            proxy: process.env.https_proxy || process.env.http_proxy || null,
            json: true,
            uri:
                process.env.GTM_TASK_CONFIG_DEFAULT_URL ||
                'https://raw.githubusercontent.com/zotoio/github-task-manager/master/.githubTaskManager.json',
        }).then((config) => {
            config.pull_request.isDefaultConfig = true;
            return {
                data: {
                    content: Buffer.from(JSON.stringify(config)).toString('base64'),
                },
            };
        });
    });

    let taskConfig = githubUtils.decodeFileResponse(fileResponse);

    if (!taskConfig[type] || !taskConfig[type].tasks || !taskConfig[type].tasks.length > 0) {
        console.error(`repository config not found for event type '${type}' in config ${json.plain(taskConfig)}`);
        return false;
    }

    console.log(`task config for ${type} = ${json.plain(taskConfig[type])}`);

    return taskConfig;
}

function getFileParams(type, body) {
    switch (type) {
        case 'pull_request':
            return {
                owner: body.pull_request.head.repo.owner.login,
                repo: body.pull_request.head.repo.name,
                path: process.env.GTM_TASK_CONFIG_FILENAME || '.githubTaskManager.json',
                ref: body.pull_request.head.ref,
            };
        case 'push':
            return {
                owner: body.repository.owner.login,
                repo: body.repository.name,
                path: process.env.GTM_TASK_CONFIG_FILENAME || '.githubTaskManager.json',
                ref: body.ref,
            };
        default:
            return {
                owner: body.repository.owner.login,
                repo: body.repository.name,
                path: process.env.GTM_TASK_CONFIG_FILENAME || '.githubTaskManager.json',
                ref: 'master',
            };
    }
}

function decodeEventBody(event) {
    return JSON.parse(decodeURIComponent(event.body.replace(/\+/g, ' ')).replace('payload={', '{'));
}

function setPullRequestEventStatus(ghEventId, eventBody) {
    let url;
    if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
        let baseUrl = process.env.GTM_BASE_URL || 'http://localhost:9091';
        url = `${baseUrl}/metrics/log/gtm-${ghEventId}.txt`;
    }

    let status = githubUtils.createPullRequestStatus(
        eventBody,
        'pending',
        'GitHub Task Manager',
        `Queued ${ghEventId}`,
        url,
    );
    githubUtils.updateGitHubPullRequestStatus(status, () => {});
}

function checkRepoBlacklisted(body) {
    let repoName = body.pull_request ? body.pull_request.head.repo.name : body.repository.name;

    let blacklist = process.env.GTM_REPO_BLACKLIST ? process.env.GTM_REPO_BLACKLIST.split(',') : [];

    let blacklisted = false;
    if (blacklist && blacklist.length > 0) {
        blacklist.forEach((blacklistPattern) => {
            if (!blacklisted) {
                let pattern = new RegExp(blacklistPattern.trim());
                if (pattern.test(repoName)) {
                    let msg = `matched blacklist repo pattern '${blacklistPattern.trim()}' - skipping.`;
                    console.log(msg);
                    blacklisted = new Error(msg);
                }
            }
        });
    }
    return blacklisted;
}

module.exports = {
    listener: listener,
    getTaskConfig: getTaskConfig,
    decodeEventBody: decodeEventBody,
    handleEvent: handleEvent,
};

'use strict';

let json = require('format-json');
let crypto = require('crypto');
let Producer = require('sqs-producer');

let githubUtils = require('../gtmGithubUtils.js');

async function listener(event, context, callback) {

    const githubEvent = event.headers['X-GitHub-Event'];

    let errMsg = githubUtils.invalidHook(event);
    if (errMsg) {
        return callback(null, {
            statusCode: 401,
            headers: {'Content-Type': 'text/plain'},
            body: errMsg,
        });
    }

    // decode and parse event body
    let eventBody = decodeEventBody(event);

    /* eslint-disable */
    console.log('---------------------------------');
    console.log(`Github-Event: "${githubEvent}"`);
    console.log('---------------------------------');
    console.log('Payload', json.plain(eventBody));
    /* eslint-enable */

    await handleEvent(githubEvent, eventBody);

    const response = {
        statusCode: 200,
        body: JSON.stringify({
            input: event,
        }),
    };

    return callback(null, response);
}

async function handleEvent(type, body) {

    // collect config from github
    let taskConfig = await getTaskConfig(type, body);
    console.log(json.plain(taskConfig));

    // add event body to SQS
    console.log('adding event to SQS: ' + process.env.SQS_PENDING_QUEUE_URL);

    // create simple producer
    let producer = Producer.create({
        queueUrl: process.env.SQS_PENDING_QUEUE_URL,
        region: process.env.GTM_AWS_REGION
    });

    let bodyString = JSON.stringify(body);
    let ghEventId = crypto.createHash('md5').update(bodyString).digest('hex');

    let event = [
        {
            id: ghEventId,
            body: bodyString,
            messageAttributes: {
                ghEventId: { DataType: 'String', StringValue: ghEventId },
                ghEventType: { DataType: 'String', StringValue: type },
                ghTaskConfig: { DataType: 'String', StringValue: json.plain(taskConfig) }
            }
        }
    ];

    console.log(`Outgoing event payload: ${json.plain(event)}`);

    producer.send(event, function(err) {
        if (err) console.log(err);
    });

}


async function getTaskConfig(type, body) {

    let fileParams = getFileParams(type, body);

    console.log(`file request params for ${type} = ${json.plain(fileParams)}`);

    let fileResponse = await githubUtils.getFile(fileParams);
    let taskConfig = githubUtils.decodeFileResponse(fileResponse);

    if (!taskConfig[type] || !taskConfig[type].tasks || !taskConfig[type].tasks.length > 0) {
        console.error(`repository config not found for event type '${type}' in config ${json.plain(taskConfig)}`);
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
            ref: body.pull_request.head.ref
        };
    case 'push':
        return {
            owner: body.repository.owner.login,
            repo: body.repository.name,
            path: process.env.GTM_TASK_CONFIG_FILENAME || '.githubTaskManager.json',
            ref: body.ref
        };
    default:
        return {
            owner: body.repository.owner.login,
            repo: body.repository.name,
            path: process.env.GTM_TASK_CONFIG_FILENAME || '.githubTaskManager.json',
            ref: 'master'
        };
    }
}

function decodeEventBody(event) {
    return JSON.parse(decodeURIComponent(event.body.replace(/\+/g,  ' ')).replace('payload={', '{'));
}

module.exports = {
    'listener': listener,
    'getTaskConfig': getTaskConfig,
    'decodeEventBody': decodeEventBody,
    'handleEvent': handleEvent
};

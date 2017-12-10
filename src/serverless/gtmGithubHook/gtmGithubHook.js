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

    if (type === 'pull_request' && body.action && ['opened', 'synchronize'].includes(body.action)) {
        console.log(`pull request: "${body.pull_request.title}" ${body.action} by ${body.pull_request.user.login}`);

        // collect config from github
        let taskConfig = await getTaskConfig(body);
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
        producer.send([
            {
                id: ghEventId,
                body: bodyString,
                messageAttributes: {
                    ghEventId: { DataType: 'String', StringValue: ghEventId },
                    ghEventType: { DataType: 'String', StringValue: type },
                    ghTaskConfig: { DataType: 'String', StringValue: JSON.stringify(taskConfig) }
                }
            }
        ], function(err) {
            if (err) console.log(err);
        });

    } else {
        console.log(`unsupported event: type: '${type}' action: '${body.action}'`);
    }
}

async function getTaskConfig(body) {

    let params = {
        owner: body.pull_request.head.repo.owner.login,
        repo: body.pull_request.head.repo.name,
        path: process.env.GTM_TASK_CONFIG_FILENAME ? process.env.GTM_TASK_CONFIG_FILENAME : '.githubTaskManager.json',
        ref: body.pull_request.head.ref
    };

    let fileResponse = await githubUtils.getFile(params);
    return githubUtils.decodeFileResponse(fileResponse);
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

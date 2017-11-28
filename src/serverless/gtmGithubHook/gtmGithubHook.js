'use strict';

var json = require('format-json');
let crypto = require('crypto');

function listener(event, context, callback) {

    function signRequestBody(key, body) {
        return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf-8').digest('hex')}`;
    }

    let errMsg; // eslint-disable-line
    const token = process.env.GTM_GITHUB_WEBHOOK_SECRET;
    const headers = event.headers;
    const sig = headers['X-Hub-Signature'];
    const githubEvent = headers['X-GitHub-Event'];
    const id = headers['X-GitHub-Delivery'];
    const calculatedSig = signRequestBody(token, event.body);

    if (typeof token !== 'string') {
        errMsg = 'Must provide a \'GITHUB_WEBHOOK_SECRET\' env variable';
        return callback(null, {
            statusCode: 401,
            headers: {'Content-Type': 'text/plain'},
            body: errMsg,
        });
    }

    if (!sig) {
        errMsg = 'No X-Hub-Signature found on request';
        return callback(null, {
            statusCode: 401,
            headers: {'Content-Type': 'text/plain'},
            body: errMsg,
        });
    }

    if (!githubEvent) {
        errMsg = 'No X-Github-Event found on request';
        return callback(null, {
            statusCode: 422,
            headers: {'Content-Type': 'text/plain'},
            body: errMsg,
        });
    }

    if (!id) {
        errMsg = 'No X-Github-Delivery found on request';
        return callback(null, {
            statusCode: 401,
            headers: {'Content-Type': 'text/plain'},
            body: errMsg,
        });
    }

    if (sig !== calculatedSig) {
        errMsg = 'X-Hub-Signature incorrect. Github webhook token doesn\'t match';
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
    console.log(`Github-Event: "${githubEvent}" with action: "${eventBody.action}"`);
    console.log('---------------------------------');
    console.log('Payload', json.plain(eventBody));
    /* eslint-enable */

    // Do custom stuff here with github event data
    // For more on events see https://developer.github.com/v3/activity/events/types/
    handleEvent(githubEvent, eventBody);

    const response = {
        statusCode: 200,
        body: JSON.stringify({
            input: event,
        }),
    };

    return callback(null, response);
}

function handleEvent(type, body) {

    if (type === 'pull_request' && body.action && ['opened', 'synchronize'].includes(body.action)) {
        console.log(`new pull request: "${body.pull_request.title}" "${body.action}" by ${body.pull_request.user.login}`);

        // add event body to SQS
        console.log(process.env.SLS_PENDING_QUEUE_URL);

    } else {
        console.log(`unsupported event: type: '${type}' action: '${body.action}'`);
    }
}


function decodeEventBody(event) {
    return JSON.parse(decodeURIComponent(event.body.replace(/\+/g,  " ")).replace('payload={', '{'));
}

module.exports = {
    "listener": listener,
    "decodeEventBody": decodeEventBody,
    "handleEvent": handleEvent
};

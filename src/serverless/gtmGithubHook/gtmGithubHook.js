'use strict';

let json = require('format-json');
let crypto = require('crypto');
let Producer = require('sqs-producer');
let GitHubApi = require('github');

async function listener(event, context, callback) {

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

    let validators = [
        {
            name: 'github secret',
            check: typeof token !== 'string',
            msg: 'Must provide a \'GITHUB_WEBHOOK_SECRET\' env variable'
        },
        {
            name: 'X-Hub-Signature',
            check: !sig,
            msg: 'No X-Hub-Signature found on request'
        },
        {
            name: 'X-Github-Event',
            check: !githubEvent,
            msg: 'No X-Github-Event found on request'
        },
        {
            name: 'X-Github-Delivery',
            check: !id,
            msg: 'No X-Github-Delivery found on request'
        },
        {
            name: 'X-Hub-Signature signing',
            check: sig !== calculatedSig,
            msg: 'X-Hub-Signature incorrect. Github webhook token doesn\'t match'
        }
    ];

    try {
        validators.forEach((v) => {
            if (v.check) {
                errMsg = v.msg;
                throw Error;
            }
            console.log(v.name + ' is ok!');
        });
    } catch(e){
        console.log(errMsg);
    }

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
    console.log(`Github-Event: "${githubEvent}" with action: "${eventBody.action}"`);
    console.log('---------------------------------');
    console.log('Payload', json.plain(eventBody));
    /* eslint-enable */

    // Do custom stuff here with github event data
    // For more on events see https://developer.github.com/v3/activity/events/types/
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
        console.log(`pull request: "${body.pull_request.title}" "${body.action}" by ${body.pull_request.user.login}`);

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
        producer.send([
            {
                id: crypto.createHash('md5').update(bodyString).digest('hex'),
                body: bodyString,
                messageAttributes: {
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

async function getFile(body) {

    let githubOptions = {
        host: process.env.GTM_GITHUB_HOST ? process.env.GTM_GITHUB_HOST : 'api.github.com',
        debug: process.env.GTM_GITHUB_DEBUG ? process.env.GTM_GITHUB_DEBUG : false,
        timeout: process.env.GTM_GITHUB_TIMEOUT ? parseInt(process.env.GTM_GITHUB_TIMEOUT) : 5000,
        pathPrefix: process.env.GTM_GITHUB_PATH_PREFIX ? process.env.GTM_GITHUB_PATH_PREFIX : '',
        proxy: process.env.GTM_GITHUB_PROXY ? process.env.GTM_GITHUB_PROXY : ''
    };

    let github = new GitHubApi(githubOptions);

    github.authenticate({
        type: 'oauth',
        token: process.env.GTM_GITHUB_TOKEN
    });

    let config = {
        owner: body.pull_request.head.repo.owner.login,
        repo: body.pull_request.head.repo.name,
        path: process.env.GTM_TASK_CONFIG_FILENAME ? process.env.GTM_TASK_CONFIG_FILENAME : 'taskConfig.json',
        ref: body.pull_request.head.ref
    };

    return new Promise(
        (resolve, reject) => {
            try {
                let response = github.repos.getContent(config);
                return resolve(response);

            } catch (err) {
                return reject(err);
            }
        }
    );
}

async function getTaskConfig(body) {
    let fileResponse = await getFile(body);
    return decodeTaskConfig(fileResponse);
}

function decodeTaskConfig(fileResponse) {

    console.log(json.plain(fileResponse));
    let buff = new Buffer(fileResponse.data.content, 'base64');

    let content = JSON.parse(buff.toString('ascii'));

    return content;
}


function decodeEventBody(event) {
    return JSON.parse(decodeURIComponent(event.body.replace(/\+/g,  " ")).replace('payload={', '{'));
}

module.exports = {
    "listener": listener,
    "decodeEventBody": decodeEventBody,
    "handleEvent": handleEvent
};

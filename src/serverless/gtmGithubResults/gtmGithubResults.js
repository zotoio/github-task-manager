'use strict';

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

console.log('cold start');
require('source-map-support').install();
let json = require('format-json');
let consumer = require('sqs-consumer');
let githubUtils = require('../gtmGithubUtils.js');
let proxy = require('proxy-agent');
let AWS = require('aws-sdk');

AWS.config.update({ region: process.env.GTM_AWS_REGION });

function handle(event, context, callback) {
    /* eslint-disable */
    console.log('---------------------------------');
    console.log(`Github-Results: `);
    console.log('---------------------------------');
    console.log('Payload', json.plain(event));
    /* eslint-enable */

    try {
        let consumer = getQueue();

        consumer.on('error', err => {
            console.log(err.message);
            throw err;
        });

        consumer.on('empty', () => {
            console.log('results queue is empty.');
            consumer.stop();
            const response = {
                statusCode: 200,
                body: JSON.stringify({
                    input: event
                })
            };
            return callback(null, response);
        });

        consumer.start();
    } catch (e) {
        console.log(e.message);
        return callback(null, {
            statusCode: 401,
            headers: { 'Content-Type': 'text/plain' },
            body: e.message
        });
    }
}

function getQueue() {
    let awsOptions = {
        queueUrl: process.env.SQS_RESULTS_QUEUE_URL,
        waitTimeSeconds: 10,
        handleMessage: githubUtils.handleEventTaskResult
    };

    if (process.env.AWS_PROXY) {
        AWS.config.update({
            httpOptions: {
                agent: proxy(process.env.AWS_PROXY)
            }
        });
    }
    awsOptions.sqs = new AWS.SQS();

    return consumer.create(awsOptions);
}

module.exports = {
    handle: handle,
    getQueue: getQueue
};

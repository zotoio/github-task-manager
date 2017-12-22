'use strict';

let json = require('format-json');
let consumer = require('sqs-consumer');
let githubUtils = require('../gtmGithubUtils.js');

async function handle(event, context, callback) {
    /* eslint-disable */
    console.log('---------------------------------');
    console.log(`Github-Results: `);
    console.log('---------------------------------');
    console.log('Payload', json.plain(event));
    /* eslint-enable */

    try {
        let consumer = await getQueue();

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

async function getQueue() {
    return await consumer.create({
        queueUrl: process.env.SQS_RESULTS_QUEUE_URL,
        waitTimeSeconds: 10,
        handleMessage: githubUtils.handleEventTaskResult
    });
}

module.exports = {
    handle: handle,
    getQueue: getQueue
};

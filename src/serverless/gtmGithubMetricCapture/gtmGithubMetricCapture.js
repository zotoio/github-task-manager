'use strict';

const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.GTM_AWS_REGION });
const ddb = new AWS.DynamoDB.DocumentClient({
    convertEmptyValues: true
});
const zlib = require('zlib');

async function handler(event, context, callback) {
    console.log('recording metrics..');

    const payload = new Buffer(event.awslogs.data, 'base64');
    zlib.gunzip(payload, (err, res) => {
        if (err) {
            console.log(err);
            return callback(err);
        }
        const payload = JSON.parse(res.toString('utf8'));
        console.log('Decoded payload:', JSON.stringify(payload));

        const EVENTS_TABLE = process.env.GTM_DYNAMO_TABLE_EVENTS;

        let promises = [];

        payload.logEvents.forEach(evt => {
            let msg;
            let isObj = true;
            try {
                msg = JSON.parse(evt.message);
            } catch (e) {
                msg = evt.message;
                console.error(`unable to parse event result ${msg}`);
                isObj = false;
            }

            /***
             * Capture event summary data
             * gtmEvents table schema: ghEventId, startTime, eventDuration, endTime,
             * tasks, eventResult, repo, eventUrl, pullTitle, pullNumber, sha, eventUser
             */
            if (isObj) {
                let updateParams;

                if (msg.resultType === 'START') {
                    console.log(`recording event start ${msg.ghEventId}..`);
                    updateParams = {
                        TableName: EVENTS_TABLE,
                        Key: {
                            ghEventId: msg.ghEventId
                        },
                        UpdateExpression:
                            'set startTime = :startTime, repo = :repo, eventUrl = :eventUrl, tasks = :tasks, ' +
                            'endTime = :endTime, eventDuration = :eventDuration, failed = :failed, ' +
                            'pullTitle = :pullTitle, pullNumber = :pullNumber, sha = :sha, eventUser = :eventUser',
                        ConditionExpression: 'attribute_not_exists(ghEventId) OR ghEventId = :ghEventId',
                        ExpressionAttributeValues: {
                            ':ghEventId': msg.ghEventId,
                            ':startTime': msg.time,
                            ':repo': msg.repo,
                            ':eventUrl': msg.url,
                            ':tasks': [],
                            ':endTime': '',
                            ':eventDuration': '',
                            ':failed': '',
                            ':pullTitle': msg.pullTitle,
                            ':pullNumber': msg.pullNumber,
                            ':sha': msg.sha,
                            ':eventUser': msg.eventUser
                        },
                        ReturnValues: 'UPDATED_NEW'
                    };
                }

                if (msg.resultType === 'TASK') {
                    console.log(`recording event progress ${msg.ghEventId}..`);

                    let task = {
                        executor: msg.executor,
                        context: msg.context,
                        duration: msg.duration,
                        failed: msg.failed,
                        time: msg.time
                    };

                    updateParams = {
                        TableName: EVENTS_TABLE,
                        Key: {
                            ghEventId: msg.ghEventId
                        },
                        UpdateExpression: 'set tasks = list_append(tasks, :task)',
                        ConditionExpression: 'attribute_not_exists(ghEventId) OR ghEventId = :ghEventId',
                        ExpressionAttributeValues: {
                            ':ghEventId': msg.ghEventId,
                            ':task': [task]
                        },
                        ReturnValues: 'UPDATED_NEW'
                    };
                }

                if (msg.resultType === 'EVENT') {
                    console.log(`recording event completion ${msg.ghEventId}..`);

                    updateParams = {
                        TableName: EVENTS_TABLE,
                        Key: {
                            ghEventId: msg.ghEventId
                        },
                        UpdateExpression: 'set endTime = :endTime, eventDuration = :eventDuration, failed = :failed',
                        ConditionExpression: 'attribute_not_exists(ghEventId) OR ghEventId = :ghEventId',
                        ExpressionAttributeValues: {
                            ':ghEventId': msg.ghEventId,
                            ':endTime': msg.time,
                            ':eventDuration': msg.duration,
                            ':failed': msg.failed
                        },
                        ReturnValues: 'UPDATED_NEW'
                    };
                }

                if (updateParams) {
                    promises.push(ddb.update(updateParams).promise());
                }
            }
        });

        Promise.all(promises).then(() => {
            callback(null, `Successfully processed ${payload.logEvents.length} log events.`);
        });
    });
}

module.exports = {
    handler: handler
};
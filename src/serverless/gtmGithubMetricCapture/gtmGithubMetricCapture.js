'use strict';

const _ = require('lodash');
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

        const LOGS_TABLE = process.env.GTM_DYNAMO_TABLE_LOGS;
        const EVENTS_TABLE = process.env.GTM_DYNAMO_TABLE_EVENTS;

        let promises = [];
        let logItems = [];

        payload.logEvents.forEach(evt => {
            let msg;
            let isObj = true;
            try {
                msg = JSON.parse(evt.message);
            } catch (e) {
                msg = evt.message;
                isObj = false;
            }
            // capture all logs to gtmLogs table
            logItems.push({
                PutRequest: {
                    Item: {
                        id: evt.id,
                        timestamp: evt.timestamp,
                        message: msg
                    }
                }
            });

            /***
             * Capture event summary data
             * gtmEvents table schema: ghEventId, startTime, eventDuration, endTime, tasks, eventResult, repo, eventUrl
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
                            'endTime = :endTime, eventDuration = :eventDuration, failed = :failed',
                        ConditionExpression: 'attribute_not_exists(ghEventId) OR ghEventId = :ghEventId',
                        ExpressionAttributeValues: {
                            ':ghEventId': msg.ghEventId,
                            ':startTime': msg.time,
                            ':repo': msg.repo,
                            ':eventUrl': msg.url,
                            ':tasks': [],
                            ':endTime': '',
                            ':eventDuration': '',
                            ':failed': ''
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

        // aws batchWrite only allows 25 at a time
        _.chunk(logItems, 20).forEach(items => {
            let params = {
                RequestItems: {}
            };
            params.RequestItems[LOGS_TABLE] = items;

            promises.push(ddb.batchWrite(params).promise());
        });

        Promise.all(promises).then(() => {
            callback(null, `Successfully processed ${payload.logEvents.length} log events.`);
        });
    });
}

module.exports = {
    handler: handler
};

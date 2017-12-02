'use strict';

const pullRequestData = require('./pullrequest.json');
require('dotenv').config();
process.env.AWS_ACCESS_KEY_ID = process.env.GTM_AGENT_AWS_ACCESS_KEY_ID;
process.env.AWS_SECRET_ACCESS_KEY = process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY;

const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.GTM_AWS_REGION });
var sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
var sns = new AWS.SNS({ apiVersion: '2010-03-31' });
require('babel-polyfill');

export class Utils {

    static samplePullRequestEvent() {
        pullRequestData.GHEventType = 'pull_request';
        return pullRequestData;
    }

    static maskString(plaintext, desiredLength = 12, visibleChars = 5, maskChar = '*') {
        var maskLength = Math.min(plaintext.length - visibleChars, desiredLength);
        return maskChar.repeat(maskLength) + plaintext.slice(-5);
    }

    static async getQueueUrl(queueName) {
        return this.getQueueUrlPromise(queueName).then(function (data) {
            console.log(data);
            return data;
        });
    }

    static async getQueueUrlPromise(queueName) {
        return new Promise((resolve, reject) => {
            return sqs.getQueueUrl({ QueueName: queueName }, function (err, data) {
                if (err) {
                    return reject(err);
                } else {
                    return resolve(data.QueueUrl);
                }
            });
        });
    }

    static async postResultsAndTrigger(sqsQueueName, results, snsQueueName, message) {
        await this.getQueueUrlPromise(sqsQueueName).then(function (sqsQueueUrl) {
            let params = {
                MessageBody: JSON.stringify(results),
                QueueUrl: sqsQueueUrl,
                DelaySeconds: 0
            };
            sqs.sendMessage(params, function (err, data) {
                if (err) console.log(err, err.stack);
                else console.log(data);
            });
        });
        console.log('Enqueue Results on SQS: ' + sqsQueueName);
        return new Promise((resolve, reject) => {
            let params = {
                Name: snsQueueName
            };
            sns.createTopic(params, function (err, data) {
                if (err) console.log(err, err.stack); // an error occurred
                else {
                    let topicArn = data.TopicArn;
                    var params = {
                        Message: message,
                        TopicArn: topicArn
                    };
                    sns.publish(params, function (err, data) {
                        if (err) {
                            console.log(err, err.stack);
                            return reject();
                        } else {
                            console.log('Published Message \'' + message + '\' to Queue');
                            console.debug(data);
                            return resolve(true);
                        }
                    });
                }
            });
        });
    }

    static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static printBanner() {
        /* eslint-disable */
        let bannerData = [
            '_____________________  ___   _______                    _____ ',
            '__  ____/__  __/__   |/  /   ___    |______ ______________  /_',
            '_  / __ __  /  __  /|_/ /    __  /| |_  __ `/  _ \\_  __ \\  __/',
            '/ /_/ / _  /   _  /  / /     _  ___ |  /_/ //  __/  / / / /_  ',
            '\\____/  /_/    /_/  /_/      /_/  |_|\\__, / \\___//_/ /_/\\__/  ',
            '                                    /____/                    '
        ];
        /* eslint-enable */
        bannerData.forEach(function (line) {
            console.log(line);
        });
    }
}
'use strict';

const pullRequestData = require('./pullrequest.json');
require('dotenv').config();
const { URL } = require('url');
import { default as AgentLogger } from './AgentLogger';
let log = AgentLogger.log();

// due to serverless .env issue
process.env.AWS_ACCESS_KEY_ID = process.env.GTM_AGENT_AWS_ACCESS_KEY_ID;
process.env.AWS_SECRET_ACCESS_KEY = process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY;

const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.GTM_AWS_REGION });
let sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
let sns = new AWS.SNS({ apiVersion: '2010-03-31' });
require('babel-polyfill');

export class Utils {

    static agentId() {
        return AgentLogger.AGENT_ID;
    }

    static sse() {
        return AgentLogger.SSE;
    }

    static stream(group, stream) {
        AgentLogger.stream(group, stream);
    }

    static stopStream(group) {
        AgentLogger.stopStream(group);
    }

    static stopAllStreams() {
        AgentLogger.stopAllStreams();
    }

    static registerActivity(ip) {
        AgentLogger.registerActivity(ip);
    }

    static samplePullRequestEvent() {
        pullRequestData.ghEventType = 'pull_request';
        return pullRequestData;
    }

    static maskString(plaintext, desiredLength = 12, visibleChars = 5, maskChar = '*') {
        let maskLength = Math.min(plaintext.length - visibleChars, desiredLength);
        return maskChar.repeat(maskLength) + plaintext.slice(-5);
    }

    /**
     * Format a URL for Basic Auth
     * @param {string} username - Basic Auth Username
     * @param {string} password - Basic Auth Password
     * @param {string} url - Base URL
     */
    static formatBasicAuth(username, password, url) {
        let basicUrl = new URL(url);
        basicUrl.username = username;
        basicUrl.password = password;
        return basicUrl.toString();
    }

    /**
     * Create a Status Object to Send to GitHub
     * @param {object} eventData - Data from GitHub Event
     * @param {string} state - Current Task State (pending, passed, failed)
     * @param {string} context - Content Name to Display in GitHub
     * @param {string} description - Short Description to Display in GitHub
     */
    static createStatus(eventData, state, context, description, url) {
        return {
            owner: eventData.repository.owner.login ? eventData.repository.owner.login : 'Default_Owner',
            repo: eventData.repository.name ? eventData.repository.name : 'Default_Repository',
            sha: eventData.pull_request.head.sha ? eventData.pull_request.head.sha : 'Missing SHA',
            state: state,
            target_url: url ? url : 'http://neko.ac', //todo
            description: description,
            context: context
        };
    }

    switchByVal(cases, defaultCase, key) {
        let result;
        if (key in cases) result = cases[key];

        // if exact key not found try splitting comma delimited and check each subkey
        if (!result) {
            Object.keys(cases).forEach((k) => {
                let subKeys = k.split(',').map((i) => { return i.trim(); });
                if (subKeys.includes(key)) {
                    result = cases[k];
                }
            });
        }

        if (!result) result = defaultCase;
        return result;
    }

    /**
     * Returns the URL for a Given Queue
     * @param {String} queueName - Name of Queue in Current AWS Account
     */
    static async getQueueUrl(queueName) {
        return sqs.getQueueUrl({ QueueName: queueName }).promise().then((data) => {
            return Promise.resolve(data.QueueUrl);
        });
    }

    /**
     * Update a Message Timeout on an SQS Queue
     * @param {String} queueName - Name of SQS Queue Holding Message
     * @param {String} messageHandle - Message Handle from ReceiveMessage Event
     * @param {Integer} timeoutValue - New Message Timeout Value (Seconds)
     */
    static async setSqsMessageTimeout(queueName, messageHandle, timeoutValue) {
        log.debug(`Setting SQS Message Timeout to ${timeoutValue} Seconds`);
        return Utils.getQueueUrl(queueName).then(function (queueUrl) {
            log.debug(`Queue URL: ${queueUrl}, Message Handle: ${messageHandle}, Timeout: ${timeoutValue}`);
            return sqs.changeMessageVisibility({
                QueueUrl: queueUrl,
                ReceiptHandle: messageHandle,
                VisibilityTimeout: timeoutValue
            }).promise();
        }).then(function(data) {
            log.info('SQS Heartbeat Sent. (' + timeoutValue + 's) ' + JSON.stringify(data));
        });
    }

    static async postResultsAndTrigger(sqsQueueName, results, snsQueueName, message) {
        return Utils.getQueueUrl(sqsQueueName).then(function (sqsQueueUrl) {
            let params = {
                MessageBody: JSON.stringify(results),
                QueueUrl: sqsQueueUrl,
                DelaySeconds: 0
            };
            return Promise.resolve(params);
        })
            .then((params) => {
                return sqs.sendMessage(params).promise();
            })
            .then(() => {
                let params = {
                    Name: snsQueueName
                };

                return sns.createTopic(params).promise();
            })
            .then((data) => {

                let topicArn = data.TopicArn;
                let params = {
                    Message: message,
                    TopicArn: topicArn
                };
                return Promise.resolve(params);
            })
            .then((params) => {
                return sns.publish(params).promise();
            })
            .then((data) => {
                log.info('Published Message \'' + message + '\' to Queue');
                log.debug(data);
                return Promise.resolve(true);
            })
            .catch((e) => {
                log.error(e);
                throw e;
            });
    }

    /**
     * Pause Execution for Arbitrary Time
     * @param {Integer} ms - Milliseconds to Pause
     */
    static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static todayDate() {
        let today = new Date();
        let dd = today.getDate();
        let mm = today.getMonth() + 1;
        let yyyy = today.getFullYear();
        if (dd < 10) {
            dd = '0' + dd;
        }
        if (mm < 10) {
            mm = '0' + mm;
        }
        return yyyy + '/' + mm + '/' + dd;
    }

    static logger() {
        return log;
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
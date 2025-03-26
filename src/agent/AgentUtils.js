'use strict';

const pullRequestData = require('./pullrequest.json');
const { URL } = require('url');
const crypto = require('crypto');

import KmsUtils from '../KmsUtils';

import { default as AgentLogger } from './AgentLogger';
import { default as yamljs } from 'yamljs';
import { default as https } from 'https';
let log = AgentLogger.log();
KmsUtils.logger = log;

const AWS = require('aws-sdk');
const proxy = require('proxy-agent');
AWS.config.update({ region: process.env.GTM_AWS_REGION });
let DDB;

if (process.env.IAM_ENABLED) {
    AWS.config.update({
        httpOptions: {
            agent: proxy(process.env.HTTP_PROXY),
        },
    });
} else {
    // due to serverless .env restrictions
    process.env.AWS_ACCESS_KEY_ID = KmsUtils.getDecrypted(process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID);
    process.env.AWS_SECRET_ACCESS_KEY = KmsUtils.getDecrypted(process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY);
}

let sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
let sns = new AWS.SNS({ apiVersion: '2010-03-31' });

const safeJsonStringify = require('safe-json-stringify');

export class AgentUtils {
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

    /**
     * Create a Text Mask for a String
     * @param {*} plaintext - Input String
     * @param {*} desiredLength - Length of Masked Output
     * @param {*} visibleChars - Number of Visible Characters to Show
     * @param {*} maskChar - Character to use as Mask
     */
    static maskString(plaintext = null, desiredLength = 12, visibleChars = 5, maskChar = '*') {
        if (plaintext != null && plaintext.length > 0) {
            let maskLength = Math.min(plaintext.length - visibleChars, desiredLength);
            return maskChar.repeat(maskLength) + plaintext.slice(-5);
        } else {
            return '';
        }
    }

    /**
     * Create an MD5 Hash of an Input Object or String
     * @param {Object} input - Object or String to Hash
     * @param {String} salt - String for Additional Salt
     */
    static createMd5Hash(input, salt = null, length = 6) {
        return crypto
            .createHash('md5')
            .update(JSON.stringify(input) + salt)
            .digest('hex')
            .slice(0, length);
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
     * @param {string} url - Link to more detail
     *
     */
    static createEventStatus(eventData, state, context, description, url) {
        return {
            eventType: eventData.ghEventType,
            owner: eventData.repository.owner.login || 'Default_Owner',
            repo: eventData.repository.name || 'Default_Repository',
            sha: eventData.ghEventType === 'pull_request' ? eventData.pull_request.head.sha : eventData.after,
            number: eventData.ghEventType === 'pull_request' ? eventData.pull_request.number : '',
            state: state,
            target_url: url ? url : 'https://github.com/zotoio/github-task-manager',
            description: description,
            context: context,
            eventData: eventData,
        };
    }

    switchByVal(cases, defaultCase, key) {
        let result;
        if (key in cases) result = cases[key];

        // if exact key not found try splitting comma delimited and check each subkey
        if (!result) {
            Object.keys(cases).forEach((k) => {
                let subKeys = k.split(',').map((i) => {
                    return i.trim();
                });
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
        return sqs
            .getQueueUrl({ QueueName: queueName })
            .promise()
            .then((data) => {
                return Promise.resolve(data.QueueUrl);
            });
    }

    /**
     * Update a Message Timeout on an SQS Queue
     * @param {String} queueName - Name of SQS Queue Holding Message
     * @param {String} messageHandle - Message Handle from ReceiveMessage Event
     * @param {Integer} timeoutValue - New Message Timeout Value (Seconds)
     */
    static async setSqsMessageTimeout(queueName, messageHandle, timeoutValue, log) {
        log.debug(`Setting SQS Message Timeout to ${timeoutValue} Seconds`);
        return AgentUtils.getQueueUrl(queueName)
            .then(function (queueUrl) {
                log.debug(`Queue URL: ${queueUrl}, Message Handle: ${messageHandle}, Timeout: ${timeoutValue}`);
                return sqs
                    .changeMessageVisibility({
                        QueueUrl: queueUrl,
                        ReceiptHandle: messageHandle,
                        VisibilityTimeout: timeoutValue,
                    })
                    .promise();
            })
            .then(function (data) {
                log.debug(`SQS Heartbeat Sent. (${timeoutValue}s) ${JSON.stringify(data)}`);
            });
    }

    static async postResultsAndTrigger(results, message, log) {
        // if this is a commit, only add comments for result.
        if (results.eventData.pusher && !message.startsWith('Result')) {
            return Promise.resolve(true);
        }
        return AgentUtils.getQueueUrl(process.env.GTM_SQS_RESULTS_QUEUE)
            .then(function (sqsQueueUrl) {
                let params = {
                    MessageBody: safeJsonStringify(results),
                    QueueUrl: sqsQueueUrl,
                    DelaySeconds: 0,
                };
                return Promise.resolve(params);
            })
            .then((params) => {
                return sqs.sendMessage(params).promise();
            })
            .then(() => {
                let params = {
                    Name: process.env.GTM_SNS_RESULTS_TOPIC,
                };

                return sns.createTopic(params).promise();
            })
            .then((data) => {
                let topicArn = data.TopicArn;
                let params = {
                    Message: message,
                    TopicArn: topicArn,
                };
                return Promise.resolve(params);
            })
            .then((params) => {
                return sns.publish(params).promise();
            })
            .then((data) => {
                log && log.info(`Published Message '${message}' to Queue`);
                log && log.debug(data);
                return Promise.resolve(true);
            })
            .catch((e) => {
                log && log.error(e);
                throw e;
            });
    }

    /**
     * Pause Execution for Arbitrary Time
     * @param {Integer} ms - Milliseconds to Pause
     */
    static timeout(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
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

    /**
     * Replace Objects with Equivalent YAML Strings
     * @param {Object} optionsDict - Dictionary of Key:Value Pairs
     */
    static toYaml(optionsDict) {
        for (let parameter in optionsDict) {
            if (parameter.startsWith('YAML_')) {
                let yamlString = yamljs.stringify(optionsDict[parameter], 8);
                let varName = parameter.replace('YAML_', '');
                optionsDict[varName] = yamlString;
                delete optionsDict[parameter];
            } else {
                if (typeof optionsDict[parameter] == 'object') {
                    optionsDict[parameter] = this.toYaml(optionsDict[parameter]);
                }
            }
        }
        return optionsDict;
    }

    /**
     * Apply Listed Transformations to Options Dictionaries
     * @param {Object} dictionary - Dictionary of Key:Value Pairs
     */
    static applyTransforms(dictionary) {
        let transforms = {
            toYaml: this.toYaml,
        };
        for (let transform in transforms) {
            dictionary = transforms[transform](dictionary);
        }
        return dictionary;
    }

    /**
     * Replace Template Strings within Objects
     * @param {Object} varDict - Source for Template Variables
     * @param {Object} template - Object to Replace Template Strings Within
     */
    static templateReplace(varDict, template, log) {
        let templateStr = JSON.stringify(template);
        if (!templateStr) {
            log.debug(`invalid template string for ${template}`);
            return template;
        }
        for (let key in varDict) {
            let re = new RegExp(key, 'g');
            log.info(`Replacing ${key} with ${this.varMask(key, varDict[key])}`);
            templateStr = templateStr.replace(re, varDict[key]);
        }
        log.debug(templateStr);
        return JSON.parse(templateStr);
    }

    static varMask(key, val) {
        if (new RegExp('LOGIN|OAUTH|KEY|TOKEN|SECRET|PASS|CLONE').test(key)) {
            return this.maskString(val);
        } else {
            return val;
        }
    }

    /**
     * Create a Templating Object from a Configuration Object
     * @param {Object} obj - EventData Object to Return Variables From
     */
    static async createBasicTemplate(obj, parent, log) {
        if (!parent.results) {
            log.info('No Parent Build. Providing Safe Defaults');
            parent.results = {
                passed: true,
                meta: {
                    buildNumber: 0,
                    buildName: 'NO_PARENT_TASK',
                },
            };
        }

        let mapDict = {
            '##GHPRNUM##': obj.pull_request ? obj.pull_request.number : '',
            '##GHREPONAME##': obj.repository.name,
            '##GH_REPOSITORY_FULLNAME##': obj.repository.full_name,
            '##GH_CLONE_URL##': obj.repository.clone_url,
            '##GH_PR_BRANCHNAME##': obj.pull_request ? obj.pull_request.head.ref : '',
            '##PARENTBUILDNUMBER##': this.metaValue(parent, 'buildNumber'),
            '##PARENTBUILDNAME##': this.metaValue(parent, 'buildName'),
            '##GIT_URL##': obj.pull_request ? obj.pull_request.html_url : obj.compare,
            '##GIT_COMMIT##': obj.pull_request ? obj.pull_request.head.sha : obj.head_commit.id,
        };

        // just add all the GTM env vars to map
        Object.keys(process.env).forEach(async (key) => {
            if (key.startsWith('GTM_')) {
                if (key.startsWith('GTM_CRYPT')) {
                    mapDict[`##${key}##`] = await KmsUtils.getDecrypted(process.env[key]);
                } else {
                    mapDict[`##${key}##`] = process.env[key];
                }
            }
        });

        return mapDict;
    }

    static metaValue(parent, field) {
        return parent.results.meta && parent.results.meta[field] ? parent.results.meta[field] : 'N/A';
    }

    static findMatchingElementInArray(inArray, elementToFind) {
        let foundItem = inArray.find(function (item, i) {
            if (item.$.name === elementToFind) {
                return i;
            }
        });
        return foundItem;
    }

    static getDynamoDB() {
        if (!DDB) {
            if (process.env.GTM_DYNAMO_VPCE) {
                log.info('Configuring DynamoDB to use VPC Endpoint');
                DDB = new AWS.DynamoDB({
                    httpOptions: {
                        agent: new https.Agent(),
                    },
                });
            } else {
                log.info('Configuring DynamoDB to use Global AWS Config');
                DDB = new AWS.DynamoDB();
            }
        } else {
            log.info('returning existing DynamoDB client');
        }
        return DDB;
    }
}

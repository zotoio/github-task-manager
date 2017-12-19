'use strict';

import 'babel-polyfill';
import { default as crypto } from 'crypto';
import { default as dotenv } from 'dotenv';
import { default as AgentLogger } from './AgentLogger';
import { default as express } from 'express';
import { default as expressNunjucks } from 'express-nunjucks';
import { default as Consumer } from 'sqs-consumer';
import { default as hljs } from 'highlight.js';
import { EventHandler } from './EventHandler';
import { Utils } from './AgentUtils';
import { default as json } from 'format-json';
import { default as GtmGithubHook } from '../serverless/gtmGithubHook/gtmGithubHook.js';

let log = AgentLogger.log();
dotenv.config();

// Setting up Instances
const app = express();
const AGENT_GROUP = process.env.GTM_AGENT_GROUP || 'default';

let pendingUrl;
let pendingQueueHandler;
let systemConfig = {};
let runmode;
systemConfig.agentGroup = AGENT_GROUP;
let isDev;

export class Agent {
    /**
     * list of required message attributes on SQS messages
     * @returns {[string,string,string,string,string]}
     */
    static get requiredAttributes() {
        return [
            'ghEventId',
            'ghEventType',
            'ghAgentGroup',
            'ghTaskConfig',
            'ghEventSignature'
        ];
    }

    /**
     * start agent
     */
    start() {
        process.on('unhandledRejection', (reason, p) => {
            log.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
            // application specific logging, throwing an error, or other logic here
        });

        if (
            !process.env.GTM_AGENT_AWS_ACCESS_KEY_ID ||
            !process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY ||
            !process.env.GTM_GITHUB_WEBHOOK_SECRET
        ) {
            log.error(
                '### ERROR ### Environment Variables GTM_GITHUB_WEBHOOK_SECRET, GTM_AGENT_AWS_ACCESS_KEY_ID, or GTM_AGENT_AWS_SECRET_ACCESS_KEY Missing!'
            );
            process.exit(1);
        }

        this.setup();
        this.configureRoutes();
        this.consumeQueue();
    }

    /**
     * setup env
     */
    setup() {
        try {
            runmode = process.env.NODE_ENV;
            if (runmode === undefined) runmode = 'production';
        } catch (error) {
            runmode = 'production';
            log.error(error);
        }
        systemConfig.event = {};

        isDev = runmode === 'development';
    }

    /**
     * setup express route mappings
     */
    configureRoutes() {
        // Configure Templates
        app.set('views', __dirname + '/templates');

        // Init Nunjucks
        expressNunjucks(app, {
            watch: isDev,
            noCache: isDev
        });

        app.get('/', (req, res) => {
            res.render('index.html', { globalProperties: systemConfig });
        });

        app.post('/hook', (req, res) => {
            let callback = (err, details) => {
                if (err) {
                    log.error(details);
                    res.statusMessage = details.body;
                    res.status(details.statusCode).end();
                } else {
                    res.json(details);
                }
            };

            GtmGithubHook.listener(req, null, callback);
        });

        app.get('/event_test/', (req, res) => {
            let event = Utils.samplePullRequestEvent();
            systemConfig.event.current = event;
            let result = EventHandler.create('pull_request').handleEvent(event);
            if (result !== true) log.info('Event was not Handled');
            else log.info('Event Handled');
            res.redirect(302, '/process/');
        });

        app.get('/process/', (req, res) => {
            let updatedEventData;
            if (systemConfig.event.current)
                updatedEventData = hljs.highlight(
                    'json',
                    JSON.stringify(systemConfig.event.current, null, 4)
                ).value;
            else updatedEventData = null;
            res.render('event.html', {
                globalProperties: systemConfig,
                eventData: updatedEventData
            });
        });

        app.get('/stream/start/:group', (req, res) => {
            this.startLogStream(req.params.group);
            if (req) res.end();
        });

        app.get('/stream/stop', (req, res) => {
            this.stopAllStreams();
            if (req) res.end();
        });

        app.get('/stream/stop/:group', (req, res) => {
            this.stopStream(req.params.group);
            if (req) res.end();
        });

        app.get('/stream/filter/:group/:stream', (req, res) => {
            Utils.stream(req.params.group, req.params.stream);
            res.json({ group: req.params.group, stream: req.params.stream });
        });

        app.get('/stream/keepalive', (req, res) => {
            let ip =
                req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            Utils.registerActivity(ip);
            if (req) res.end();
        });

        app.get('/routes', (req, res) => {
            if (req) res.json(this.showRoutes());
        });

        app.use('/static', express.static(__dirname + '/static'));

        app.get('/config', (req, res) => {
            res.json(systemConfig);
        });

        app.get('/config/pendingqueue', (req, res) => {
            res.json(systemConfig.pendingQueue);
        });

        app.get('/config/pendingqueue/:desiredState', (req, res) => {
            try {
                let desiredState = req.params.desiredState;
                if (!desiredState === 'enable' || !desiredState === 'disable') {
                    log.debug(
                        'Unknown State: ' + desiredState + '. Ignoring Request.'
                    );
                } else {
                    if (desiredState === 'disable') {
                        pendingQueueHandler.stop();
                        log.info('Queue Processing Stopped');
                    } else {
                        pendingQueueHandler.start();
                        log.info('Queue Processing Started');
                    }
                }
            } catch (error) {
                log.error('Error Setting Queue State from Request');
            }
            systemConfig.pendingQueue.enabled = !pendingQueueHandler.stopped;
            systemConfig.pendingQueue.state = pendingQueueHandler.stopped
                ? 'Stopped'
                : 'Running';
            res.json({ state: systemConfig.pendingQueue.state });
        });
    }

    /**
     * connect to SQS pending queue and consume messages
     */
    consumeQueue() {
        let that = this;

        Utils.getQueueUrl(process.env.GTM_SQS_PENDING_QUEUE).then(function(
            data
        ) {
            pendingUrl = data;
            systemConfig.pendingQueue = {};
            systemConfig.pendingQueue.url = pendingUrl;

            pendingQueueHandler = Consumer.create({
                queueUrl: pendingUrl,
                region: process.env.GTM_AWS_REGION,
                messageAttributeNames: Agent.requiredAttributes,

                handleMessage: async (message, done) => {
                    log.info(
                        '## == NEW EVENT =================================='
                    );
                    log.info('Received Event from Queue');
                    log.debug(`message: ${json.plain(message)}`);

                    let attrs;
                    try {
                        attrs = that.validateMessage(message);
                    } catch (e) {
                        log.error(e.message);
                        done(); //todo dead letter queue here rather than discard
                        return;
                    }

                    let eventData = that.prepareEventData(message, attrs);

                    if (attrs.ghAgentGroup !== AGENT_GROUP) {
                        log.info(
                            `agentGroup mismatch - event: '${
                                attrs.ghAgentGroup
                            }' agent: '${AGENT_GROUP}' skipping..`
                        );
                        Utils.setSqsMessageTimeout(
                            process.env.GTM_SQS_PENDING_QUEUE,
                            message.ReceiptHandle,
                            5
                        );
                        done(new Error()); // Re-Queue Messages that don't match our Agent Group
                        return;
                    }

                    if (!EventHandler.isRegistered(attrs.ghEventType)) {
                        log.error(
                            `No Event Handler for Type: '${
                                attrs.ghEventType
                            }' (Event ID: ${attrs.ghEventId})`
                        );
                        done();
                    } else {
                        let loopTimer = setInterval(function() {
                            Utils.setSqsMessageTimeout(
                                process.env.GTM_SQS_PENDING_QUEUE,
                                message.ReceiptHandle,
                                30
                            );
                        }, 5000);

                        // handle the event and execute tasks
                        try {
                            await EventHandler.create(
                                attrs.ghEventType,
                                eventData
                            )
                                .handleEvent()
                                .then(() => {
                                    done();
                                    clearInterval(loopTimer);
                                    return Promise.resolve(
                                        log.info(
                                            `### Event handled: type=${
                                                attrs.ghEventType
                                            } id=${attrs.ghEventId}}`
                                        )
                                    );
                                });
                        } catch (e) {
                            log.error(e);
                            clearInterval(loopTimer);
                            done(e);
                        }
                    }
                }
            });

            that.listen(pendingQueueHandler);
        });
    }

    /**
     * verify message attributes exist and check signing
     * @param message
     * @returns {{}} result attribute object
     */
    validateMessage(message) {
        let result = {};

        Agent.requiredAttributes.forEach(attr => {
            try {
                result[attr] = message.MessageAttributes[attr].StringValue;
            } catch (TypeError) {
                throw new Error(
                    `No Message Attribute '${attr}' in Message - discarding Event!`
                );
            }
        });

        if (!this.checkEventSignature(result.ghEventSignature, message)) {
            throw new Error('Event signature mismatch - discarding Event!');
        } else {
            log.info('Event signature verified. processing event..');
        }

        return result;
    }

    /**
     * sign the event message, and check that github signature matches
     * @param signature
     * @param event
     * @returns {boolean}
     */
    checkEventSignature(signature, event) {
        let checkEvent = {
            id: event.MessageAttributes.ghEventId.StringValue,
            body: event.Body,
            messageAttributes: {
                ghEventId: {
                    DataType: 'String',
                    StringValue: event.MessageAttributes.ghEventId.StringValue
                },
                ghEventType: {
                    DataType: 'String',
                    StringValue: event.MessageAttributes.ghEventType.StringValue
                },
                ghTaskConfig: {
                    DataType: 'String',
                    StringValue:
                        event.MessageAttributes.ghTaskConfig.StringValue
                },
                ghAgentGroup: {
                    DataType: 'String',
                    StringValue:
                        event.MessageAttributes.ghAgentGroup.StringValue
                }
            }
        };

        log.debug(
            `eventString for signature check: ${JSON.stringify(checkEvent)}`
        );
        let calculatedSig = `sha1=${crypto
            .createHmac('sha1', process.env.GTM_GITHUB_WEBHOOK_SECRET)
            .update(JSON.stringify(checkEvent), 'utf-8')
            .digest('hex')}`;

        if (calculatedSig !== signature) {
            throw new Error(
                `signature mismatch: ${calculatedSig} !== ${signature}`
            );
        }

        return calculatedSig === signature;
    }

    /**
     * create eventData object from message body, and attach message attributes
     * @param message
     * @param attrs
     */
    prepareEventData(message, attrs) {
        let eventData = JSON.parse(message.Body);
        eventData.ghEventId = attrs.ghEventId;
        eventData.ghEventType = attrs.ghEventType;
        eventData.ghTaskConfig = JSON.parse(attrs.ghTaskConfig);
        eventData.ghAgentGroup = attrs.ghAgentGroup;
        eventData.ghEventSignature = attrs.ghEventSignature;
        eventData.MessageHandle = message.ReceiptHandle;

        systemConfig.event.current = eventData;

        return eventData;
    }

    /**
     * start express listener, and handle queue errors
     * @param pendingQueueHandler
     */
    listen(pendingQueueHandler) {
        pendingQueueHandler.on('error', err => {
            log.error('ERROR In SQS Queue Handler');
            log.error(err.message);
        });

        app.listen(process.env.GTM_AGENT_PORT, function() {
            Utils.printBanner();
            log.info('AGENT_ID: ' + Utils.agentId());
            log.info('AGENT_GROUP: ' + AGENT_GROUP);
            log.info(
                'GitHub Task Manager Agent Running on Port ' +
                    process.env.GTM_AGENT_PORT
            );
            log.info('Runmode: ' + runmode);
            log.info(
                'AWS Access Key ID: ' +
                    Utils.maskString(process.env.GTM_AGENT_AWS_ACCESS_KEY_ID)
            );
            log.info(
                'AWS Access Key: ' +
                    Utils.maskString(
                        process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY
                    )
            );
            log.info('Pending Queue URL: ' + pendingUrl);

            pendingQueueHandler.start();
            log.info('Queue Processing Started');
            systemConfig.pendingQueue.state = pendingQueueHandler.stopped
                ? 'Stopped'
                : 'Running';
            systemConfig.pendingQueue.enabled = !pendingQueueHandler.stopped;
            systemConfig.agentId = Utils.agentId();
        });
    }

    /**
     * start cloudwatch log streaming via express SSE for given group
     * @param group
     */
    startLogStream(group) {
        // start cloudwatch streams
        Utils.stream(group);

        // Server Sent Events stream hooked to cloudwatch
        app.get(`/stream/${group}`, Utils.sse()[group].init);
    }

    /**
     * stop log stream for group
     * @param group
     */
    stopStream(group) {
        Utils.stopStream(group);
    }

    /**
     * stop all log streams
     */
    stopAllStreams() {
        Utils.stopAllStreams();
    }

    /**
     * show all express routes configured
     */
    showRoutes() {
        return app._router.stack;
    }
}

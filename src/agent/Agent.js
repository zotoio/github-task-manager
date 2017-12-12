'use strict';

import 'babel-polyfill';
import { default as crypto } from 'crypto';
import { default as dotenv } from 'dotenv';
dotenv.config();

import { default as AgentLogger } from './AgentLogger';
let log = AgentLogger.log();

import { default as express } from 'express';
import { default as expressNunjucks } from 'express-nunjucks';
import { default as Consumer } from 'sqs-consumer';
import { default as hljs } from 'highlight.js';

import { EventHandler } from './EventHandler';
import { Utils } from './AgentUtils';
import { default as json } from 'format-json';

// Setting up Instances
const app = express();

export class Agent {

    start() {

        process.on('unhandledRejection', (reason, p) => {
            log.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
            // application specific logging, throwing an error, or other logic here
        });

        if (!process.env.GTM_AGENT_AWS_ACCESS_KEY_ID || !process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY) {
            log.error('### ERROR ### Environment Variables GTM_AGENT_AWS_ACCESS_KEY_ID or GTM_AGENT_AWS_SECRET_ACCESS_KEY Missing!');
            process.exit(1);
        }

        this.launchAgent();
    }

    launchAgent() {

        let pendingQueueHandler;
        let systemConfig = {};
        let runmode;

        try {
            runmode = process.env.NODE_ENV;
            if (runmode === undefined)
                runmode = 'production';
        } catch (error) {
            runmode = 'production';
            log.error(error);
        }
        systemConfig.event = {};

        const isDev = runmode === 'development';

        // Configure Templates
        app.set('views', __dirname + '/templates');

        // Init Nunjucks
        expressNunjucks(app, {
            watch: isDev,
            noCache: isDev
        });

        app.get('/', (req, res) => {
            res.render('index.html', {globalProperties: systemConfig});
        });

        app.get('/event_test/', (req, res) => {
            let event = Utils.samplePullRequestEvent();
            systemConfig.event.current = event;
            let result = EventHandler.create('pull_request').handleEvent(event);
            if (result !== true)
                log.info('Event was not Handled');
            else
                log.info('Event Handled');
            res.redirect(302, '/process/');
        });

        app.get('/process/', (req, res) => {
            let updatedEventData;
            if (systemConfig.event.current)
                updatedEventData = hljs.highlight('json', JSON.stringify(systemConfig.event.current, null, 4)).value;
            else
                updatedEventData = null;
            res.render('event.html', {globalProperties: systemConfig, eventData: updatedEventData});
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
            res.json({group: req.params.group, stream: req.params.stream});
        });

        app.get('/stream/keepalive', (req, res) => {
            var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
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
                    log.debug('Unknown State: ' + desiredState + '. Ignoring Request.');
                } else {
                    if (desiredState === 'disable') {
                        pendingQueueHandler.stop();
                        log.debug('Queue Processing Stopped');
                    } else {
                        pendingQueueHandler.start();
                        log.debug('Queue Processing Started');
                    }
                }
            } catch(error) {
                log.error('Error Setting Queue State from Request');
            }
            systemConfig.pendingQueue.enabled = !pendingQueueHandler.stopped;
            systemConfig.pendingQueue.state = pendingQueueHandler.stopped ? 'Stopped' : 'Running';
            res.json({state: systemConfig.pendingQueue.state});
        });

        let that = this;

        Utils.getQueueUrl(process.env.GTM_SQS_PENDING_QUEUE).then(function (data) {

            let pendingUrl = data;
            systemConfig.pendingQueue = {};
            systemConfig.pendingQueue.url = pendingUrl;

            pendingQueueHandler = Consumer.create({

                queueUrl: pendingUrl,
                region: process.env.GTM_AWS_REGION,
                messageAttributeNames: ['ghEventType', 'ghTaskConfig', 'ghEventId', 'ghEventSignature'],

                handleMessage: async (message, done) => {

                    log.info('====================================');
                    log.info('Received Event from Queue');
                    log.debug(`message: ${json.plain(message)}`);

                    let ghEventId;
                    try {
                        ghEventId = message.MessageAttributes.ghEventId.StringValue;
                    } catch (TypeError) {
                        log.error('No Message Attribute \'ghEventId\' in Message. Defaulting to \'unknown\'');
                        ghEventId = 'unknown';
                    }

                    let ghEventType;
                    try {
                        ghEventType = message.MessageAttributes.ghEventType.StringValue;
                    } catch (TypeError) {
                        log.error('No Message Attribute \'ghEventType\' in Message. Defaulting to \'status\'');
                        ghEventType = 'status';
                    }

                    let taskConfig;
                    try {
                        taskConfig = JSON.parse(message.MessageAttributes.ghTaskConfig.StringValue);
                    } catch (TypeError) {
                        log.error('No Message Attribute \'ghTaskConfig\' in Message. Defaulting to \'{}\'');
                        taskConfig = JSON.parse({});
                    }

                    let ghEventSignature;
                    try {
                        ghEventSignature = message.MessageAttributes.ghEventSignature.StringValue;
                        if (!that.checkEventSignature(ghEventSignature, message)) {
                            log.error('Event signature mismatch - discarding Event!');
                            done();
                            return;
                        } else {
                            log.info('Event signature verified. processing event..');
                        }

                    } catch (TypeError) {
                        log.error('No Message Attribute \'ghEventSignature\' in Message. Discarding Event!');
                        log.error(TypeError.message);
                        done();
                        return;
                    }

                    let eventData = JSON.parse(message.Body);
                    eventData.ghEventId = ghEventId;
                    eventData.ghEventType = ghEventType;
                    eventData.ghTaskConfig = taskConfig;
                    systemConfig.event.current = eventData;

                    if (!EventHandler.isRegistered(ghEventType)) {
                        log.info(`No Event Handler for Type: '${ghEventType}' (Event ID: ${ghEventId})`);

                    } else {

                        // handle the event and execute tasks
                        await (EventHandler.create(ghEventType, eventData).handleEvent()).then(() => {
                            done();
                            return Promise.resolve(log.info(`Event handled: type=${ghEventType} id=${ghEventId}}`));

                        });

                    }

                }
            });

            pendingQueueHandler.on('error', (err) => {
                log.error('ERROR In SQS Queue Handler');
                log.error(err.message);
            });

            app.listen(process.env.GTM_AGENT_PORT, function () {
                Utils.printBanner();
                log.info('AGENT_ID: ' + Utils.agentId());
                log.info('GitHub Task Manager Agent Running on Port ' + process.env.GTM_AGENT_PORT);
                log.info('Runmode: ' + runmode);
                log.info('AWS Access Key ID: ' + Utils.maskString(process.env.GTM_AGENT_AWS_ACCESS_KEY_ID));
                log.info('AWS Access Key: ' + Utils.maskString(process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY));
                log.info('Pending Queue URL: ' + pendingUrl);

                pendingQueueHandler.start();
                log.info('Queue Processing Started');
                systemConfig.pendingQueue.state = pendingQueueHandler.stopped ? 'Stopped' : 'Running';
                systemConfig.pendingQueue.enabled = !pendingQueueHandler.stopped;
                systemConfig.agentId = Utils.agentId();
            });
            
        });
    }

    checkEventSignature(signature, event) {

        let checkEvent = {
            id: event.MessageAttributes.ghEventId.StringValue,
            body: event.Body,
            messageAttributes: {
                ghEventId: {DataType: 'String', StringValue: event.MessageAttributes.ghEventId.StringValue},
                ghEventType: {DataType: 'String', StringValue: event.MessageAttributes.ghEventType.StringValue},
                ghTaskConfig: {DataType: 'String', StringValue: event.MessageAttributes.ghTaskConfig.StringValue}
            }
        };

        log.debug(`eventString for signature check: ${JSON.stringify(checkEvent)}`);
        let calculatedSig = `sha1=${crypto.createHmac('sha1', process.env.GTM_GITHUB_WEBHOOK_SECRET)
            .update(JSON.stringify(checkEvent), 'utf-8').digest('hex')}`;

        if (calculatedSig !== signature) {
            log.error(`signature mismatch: ${calculatedSig} !== ${signature}`);
        }

        return (calculatedSig === signature);
    }

    startLogStream(group) {

        // start cloudwatch streams
        Utils.stream(group);

        // Server Sent Events stream hooked to cloudwatch
        app.get(`/stream/${group}`, Utils.sse()[group].init);
    }

    stopStream(group) {
        Utils.stopStream(group);
    }

    stopAllStreams() {
        Utils.stopAllStreams();
    }

    showRoutes() {
        return app._router.stack;
    }
}

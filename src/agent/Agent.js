'use strict';

import 'babel-polyfill';

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
            Utils.registerActivity();
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

        Utils.getQueueUrlPromise(process.env.GTM_SQS_PENDING_QUEUE).then(function (data) {

            let pendingUrl = data;
            systemConfig.pendingQueue = {};
            systemConfig.pendingQueue.url = pendingUrl;

            pendingQueueHandler = Consumer.create({

                queueUrl: pendingUrl,
                region: process.env.GTM_AWS_REGION,
                messageAttributeNames: ['ghEventType', 'ghTaskConfig'],

                handleMessage: (message, done) => {

                    log.info('Received Event from Queue');
                    log.debug(message);
                    log.debug('JSON Parse');
                    log.debug(JSON.parse(message.Body));

                    let ghEvent;
                    try {
                        ghEvent = message.MessageAttributes.ghEventType.StringValue;
                    } catch (TypeError) {
                        log.error('No Message Attribute \'ghEventType\' in Message. Defaulting to \'status\'');
                        ghEvent = 'status';
                    }

                    let taskConfig;
                    try {
                        taskConfig = JSON.parse(message.MessageAttributes.ghTaskConfig.StringValue);
                    } catch (TypeError) {
                        log.error('No Message Attribute \'ghTaskConfig\' in Message. Defaulting to \'{}\'');
                        taskConfig = JSON.parse({});
                    }

                    let messageBody = JSON.parse(message.Body);
                    messageBody.ghEventType = ghEvent;
                    messageBody.ghTaskConfig = taskConfig;
                    systemConfig.event.current = messageBody;

                    if (!EventHandler.isRegistered(ghEvent)) {
                        log.info('Event was not Handled: ' + ghEvent);
                    } else {
                        EventHandler.create(ghEvent).handleEvent(messageBody);
                        log.info('Event Handled: ' + ghEvent);
                    }
                        
                    done();
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
            });
            
        });
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

'use strict';

// Required Modules
const express = require('express');
const expressNunjucks = require('express-nunjucks');
const Consumer = require('sqs-consumer');
const hljs = require('highlight.js');
import { HandlerStore } from '../lib/HandlerStore';
import { Utils } from '../lib/utils';
require('dotenv').config();
require('babel-polyfill');
const SSE = require('express-sse');
let sse = new SSE();

(function () {
    let oldLog = console.log;
    console.log = function (message) {

        if (sse) {
            sse.send(message);
        }

        oldLog.apply(console, arguments);
    };
})();

if (!process.env.GTM_AGENT_AWS_ACCESS_KEY_ID || !process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY) {
    console.log('### ERROR ### Environment Variables GTM_AGENT_AWS_ACCESS_KEY_ID or GTM_AGENT_AWS_SECRET_ACCESS_KEY Missing!');
    process.exit(1);
}

let pendingQueueHandler;
let systemConfig = {};
let runmode;
try {
    runmode = process.env.NODE_ENV;
    if (runmode == undefined)
        runmode = 'production';
} catch (error) {
    runmode = 'production';
    console.log(error);
}
systemConfig.event = {};

// Setting up Instances
const app = express();
const isDev = runmode === 'development';

// Configure Templates
app.set('views', __dirname + '/templates');

// Init Nunjucks
const njk = expressNunjucks(app, {
    watch: isDev,
    noCache: isDev
});

app.get('/', (req, res) => {
    res.render('index.html', { globalProperties: systemConfig });
});

app.get('/event_test/', (req, res) => {
    var event = Utils.samplePullRequestEvent();
    systemConfig.event.current = event;
    let result = HandlerStore.handleEvent(event);
    if (result != true)
        console.log('Event was not Handled');
    else
        console.log('Event Handled');
    res.redirect(302, '/process/');
});

app.get('/process/', (req, res) => {
    let updatedEventData;
    if (systemConfig.event.current)
        updatedEventData = hljs.highlight('json', JSON.stringify(systemConfig.event.current, null, 4)).value;
    else
        updatedEventData = null;
    res.render('event.html', { globalProperties: systemConfig, eventData: updatedEventData });
});

app.get('/stream', sse.init);

app.use('/static', express.static(__dirname + '/static'));

Utils.getQueueUrlPromise(process.env.GTM_SQS_PENDING_QUEUE).then(function (data) {
    let pendingUrl = data;
    systemConfig.pendingQueue = {};
    systemConfig.pendingQueue.url = pendingUrl;

    pendingQueueHandler = Consumer.create({
        queueUrl: pendingUrl,
        region: process.env.GTM_AWS_REGION,
        messageAttributeNames: ['ghEventType', 'ghTaskConfig'],
        handleMessage: (message, done) => {
            console.log('Received Event from Queue');
            console.debug(message);
            console.debug('JSON Parse');
            console.debug(JSON.parse(message.Body));
            let ghEvent;
            try {
                ghEvent = message.MessageAttributes.ghEventType.StringValue;
            } catch (TypeError) {
                console.log('No Message Attribute \'ghEventType\' in Message. Defaulting to \'status\'');
                ghEvent = 'status';
            }
            let taskConfig;
            try {
                taskConfig = JSON.parse(message.MessageAttributes.ghTaskConfig.StringValue);
            } catch (TypeError) {
                console.log('No Message Attribute \'ghTaskConfig\' in Message. Defaulting to \'{}\'');
                taskConfig = JSON.parse({});
            }
            let messageBody = JSON.parse(message.Body);
            messageBody.ghEventType = ghEvent;
            messageBody.ghTaskConfig = taskConfig;
            systemConfig.event.current = messageBody;
            let result = HandlerStore.handleEvent(messageBody);
            if (result != true)
                console.log('Event was not Handled: ' + ghEvent);
            else
                console.log('Event Handled: ' + ghEvent);
            done();
        }
    });

    pendingQueueHandler.on('error', (err) => {
        console.log('ERROR In SQS Queue Handler');
        console.log(err.message);
    });

    pendingQueueHandler.on('stopped', () => {
        console.log('Queue Processing Stopped');
        systemConfig.pendingQueue.state = 'Stopped';
    });

    pendingQueueHandler.start();
    systemConfig.pendingQueue.state = 'Running';

    app.listen(process.env.GTM_AGENT_PORT, function () {
        Utils.printBanner();
        console.log('GitHub Task Manager Agent Running on Port ' + process.env.GTM_AGENT_PORT);
        console.log('Runmode: ' + runmode);
        console.log('AWS Access Key ID: ' + Utils.maskString(process.env.GTM_AGENT_AWS_ACCESS_KEY_ID));
        console.log('AWS Access Key: ' + Utils.maskString(process.env.GTM_AGENT_AWS_SECRET_ACCESS_KEY));
        console.log('Pending Queue URL: ' + pendingUrl);
        console.debug(njk.env);
    });
});
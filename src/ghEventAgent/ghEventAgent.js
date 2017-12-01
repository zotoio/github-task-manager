'use strict';

// Required Modules
const express = require('express');
const expressNunjucks = require('express-nunjucks');
const Consumer = require('sqs-consumer');
const hljs = require('highlight.js');
import {EventHandler} from '../lib/EventHandler';
import {HandlerStore} from '../lib/HandlerStore';
import {Utils} from '../lib/utils';
import {CIExecutorFactory} from '../lib/CIExecutorFactory';
require('dotenv').config();
require('babel-polyfill');

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('######### aws env AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY missing! ###########');
    process.exit(1);
}

// Init Event Handler
let handlers = new HandlerStore();
handlers.addHandler(new EventHandler('pull_request', function(eventData) {
    console.log('-----------------------------');
    console.log('New Event: ' + eventData.ghEventType);
    console.log('Repository Name: ' + eventData.repository.name);
    console.log('Pull Request: ' + eventData.pull_request.number);
    let status = {
        owner: eventData.repository.owner.login ? eventData.repository.owner.login : 'Default_Owner',
        repo: eventData.repository.name ? eventData.repository.name : 'Default_Repository',
        sha: eventData.pull_request.head.sha ? eventData.pull_request.head.sha : 'Missing SHA',
        state: 'success',
        target_url: 'http://neko.ac',
        description: 'Tests from Orchestrator Passed',
        context: 'Functional-Tests'
    };
    Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function() {
        console.log('-----------------------------');
    });
}));

let pendingQueueHandler;
let systemConfig = {};
let runmode;
try {
    runmode = process.env.NODE_ENV;
    if(runmode == undefined)
        runmode = 'production';
} catch(error) {
    runmode = 'production';
    console.log(error);
}
systemConfig.event = {};

// Setting up Instances
const app = express();
const isDev = runmode === 'development';
let ciTool = new CIExecutorFactory();
let ciToolJenkins = ciTool.createCIExecutor('CI_JENKINS');
let ciToolTC = ciTool.createCIExecutor('CI_TEAMCITY');
console.log(ciToolJenkins.info());
console.log(ciToolTC.info());

// Configure Templates
app.set('views', __dirname + '/templates');

// Init Nunjucks
const njk = expressNunjucks(app, {
    watch: isDev,
    noCache: isDev
});

app.get('/', (req, res) => {
    res.render('index.html', {globalProperties: systemConfig});
});

app.get('/event_test/', (req, res) => {
    var event = Utils.samplePullRequestEvent();
    systemConfig.event.current = event;
    let result = handlers.handleEvent(event, systemConfig);
    if(result != true)
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
    res.render('event.html', {globalProperties: systemConfig, eventData: updatedEventData});
});

app.use('/static', express.static(__dirname + '/static'));

Utils.getQueueUrlPromise(process.env.GTM_SQS_PENDING_QUEUE).then(function(data) {
    let pendingUrl = data;
    systemConfig.pendingQueue = {};
    systemConfig.pendingQueue.url = pendingUrl;

    pendingQueueHandler = Consumer.create({
        queueUrl: pendingUrl,
        region: 'ap-southeast-2',
        messageAttributeNames: ['ghEventType'],
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
            let messageBody = JSON.parse(message.Body);
            messageBody.ghEventType = ghEvent;
            systemConfig.event.current = messageBody;
            let result = handlers.handleEvent(messageBody, systemConfig);
            if(result != true)
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

    app.listen(process.env.PORT, function() {
        Utils.printBanner();
        console.log('GitHub Event Orchestrator Running on Port ' + process.env.PORT);
        console.log('Runmode: ' + runmode);
        console.log('AWS Access Key ID: ' + Utils.maskString(process.env.AWS_ACCESS_KEY_ID));
        console.log('AWS Access Key: ' + Utils.maskString(process.env.AWS_SECRET_ACCESS_KEY));
        console.log('Pending Queue URL: ' + pendingUrl);
        console.debug(njk.env);
    });
});
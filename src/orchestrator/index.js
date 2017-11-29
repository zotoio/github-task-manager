// Required Modules
const express = require('express');
const expressNunjucks = require('express-nunjucks');
const Consumer = require('sqs-consumer');
import {EventHandler} from '../lib/EventHandler';
import {Utils} from '../lib/utils';
require('dotenv').config();
require('babel-polyfill');

// Init Event Handler
let sampleEventHandler = new EventHandler('pull_request', function(eventData) {
    console.log('Processed Event ' + eventData.pull_request.repo.name);
});

let pendingQueueHandler;
let systemConfig = {};

// Setting up Instances
const app = express();
const isDev = process.env.ENVIRONMENT === 'development';

const bannerData = [
    ' #####  #     # #######                            ',
    '#     # #     # #       #    # ###### #    # ##### ',
    '#       #     # #       #    # #      ##   #   #   ',
    '#  #### ####### #####   #    # #####  # #  #   #   ',
    '#     # #     # #       #    # #      #  # #   #   ',
    '#     # #     # #        #  #  #      #   ##   #   ',
    ' #####  #     # #######   ##   ###### #    #   #   ',
    '###################################################'
];

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
    sampleEventHandler.handleEvent(event);
    res.render('index.html');
});

Utils.getQueueUrlPromise(process.env.GTM_SQS_PENDING_QUEUE).then(function(data) {
    let pendingUrl = data;
    systemConfig.pendingQueue = {};
    systemConfig.pendingQueue.url = pendingUrl;
    pendingQueueHandler = Consumer.create({
        queueUrl: pendingUrl,
        region: 'ap-southeast-2',
        handleMessage: (message, done) => {
            sampleEventHandler.handleEvent(message);
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

    bannerData.forEach(function(line) {
        console.log(line);
    });

    app.listen(process.env.PORT, function() {
        console.log('GitHub Event Orchestrator Running on Port ' + process.env.PORT);
        console.log('Runmode: ' + process.env.ENVIRONMENT);
        console.log('AWS Access Key ID: ' + Utils.maskString(process.env.AWS_ACCESS_KEY_ID));
        console.log('AWS Access Key: ' + Utils.maskString(process.env.AWS_SECRET_ACCESS_KEY));
        console.log('Pending Queue URL: ' + pendingUrl);
        console.debug(njk.env);
    });
});
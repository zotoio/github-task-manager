import { default as ExpressSSE } from 'express-sse';
import { default as AWS } from 'aws-sdk';
import { default as AgentLogger } from './AgentLogger';
import { default as json } from 'format-json';
import { default as DynamoDBStream } from 'dynamodb-stream';
import { schedule } from 'tempus-fugit';
AWS.config.update({ region: process.env.GTM_AWS_REGION });

let log = AgentLogger.log();
const EVENTS_TABLE = process.env.GTM_DYNAMO_TABLE_EVENTS;
let INITIAL_DATA = [];
let EventMetricStream;

async function configureRoutes(app) {
    let ddb = new AWS.DynamoDB();
    let ddbDocClient = new AWS.DynamoDB.DocumentClient({
        convertEmptyValues: true
    });
    let tableDetails = await ddb.describeTable({ TableName: EVENTS_TABLE }).promise();
    log.debug(json.plain(tableDetails));
    let tableStreamArn = tableDetails.Table.LatestStreamArn;

    let ddbStream = new DynamoDBStream(new AWS.DynamoDBStreams(), tableStreamArn);

    ddbStream.on('error', err => {
        log.error(err);
    });

    ddbStream.on('end', () => {
        log.info(`stream closed`);
    });

    // fetch stream state initially
    ddbStream.fetchStreamState(async err => {
        if (err) {
            log.error(err);
            return process.exit(1);
        }

        // fetch initial data
        let eventData = await ddbDocClient.scan({ TableName: EVENTS_TABLE }).promise();
        INITIAL_DATA = eventData.Items;
        log.debug(`INITIAL_DATA: ${json.plain(INITIAL_DATA)}`);

        // poll
        schedule({ second: 10 }, function(job) {
            ddbStream.fetchStreamState(job.callback());
        });

        EventMetricStream = new ExpressSSE(INITIAL_DATA);
        app.get('/metrics/stream', EventMetricStream.init);

        app.get('/metrics', (req, res) => {
            res.render('metrics.html');
        });
    });

    ddbStream.on('insert record', eventObject => {
        log.info(`inserted ${json.plain(eventObject)}`);
        INITIAL_DATA.push(eventObject);
        EventMetricStream.updateInit(INITIAL_DATA);
        EventMetricStream.send(eventObject);
    });

    ddbStream.on('modify record', eventObject => {
        log.info(`updated ${json.plain(eventObject)}`);
        INITIAL_DATA.push(eventObject);
        EventMetricStream.updateInit(INITIAL_DATA);
        EventMetricStream.send(eventObject);
    });
}

module.exports = {
    configureRoutes: configureRoutes
};

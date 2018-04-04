import { default as ExpressSSE } from 'express-sse';
import { default as AWS } from 'aws-sdk';
import { default as AgentLogger } from './AgentLogger';
import { default as json } from 'format-json';
import { default as DynamoDBStream } from 'dynamodb-stream';
import { default as elasticsearch } from 'elasticsearch';
import { schedule } from 'tempus-fugit';
AWS.config.update({ region: process.env.GTM_AWS_REGION });

let log = AgentLogger.log();
const EVENTS_TABLE = process.env.GTM_DYNAMO_TABLE_EVENTS;
let INITIAL_DATA = [];
let EventMetricStream;

let elastic;
if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
    elastic = new elasticsearch.Client({
        host: `${process.env.GTM_ELASTIC_HOST}:${process.env.GTM_ELASTIC_PORT}`,
        log: 'trace'
    });
}

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

        app.get('/metrics/log/:ghEventId', async (req, res) => {
            if (!elastic) {
                res.json({ error: 'elasticsearch is not configured' });
                res.end();
                return;
            }

            let ghEventId = req.params.ghEventId;
            let logs = await getEventLogs(ghEventId);
            res.json(logs);
        });

        app.get('/metrics/log/:ghEventId/text', async (req, res) => {
            if (!elastic) {
                res.write('elasticsearch is not configured');
                res.end();
                return;
            }

            let ghEventId = req.params.ghEventId;
            let logs = await getEventLogs(ghEventId);

            logs.forEach(log => {
                res.write(`${log._source['@timestamp']} ${log._source.message} \n`);
            });

            res.end();
        });
    });

    async function getEventLogs(ghEventId) {
        let results = await elastic.search({
            index: 'logstash*',
            size: 1000,
            body: {
                query: {
                    match: {
                        ghEventId: ghEventId
                    }
                }
            },
            sort: '@timestamp:asc'
        });

        return results.hits.hits;
    }

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

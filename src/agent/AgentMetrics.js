import { default as ExpressSSE } from 'express-sse';
import { default as AWS } from 'aws-sdk';
import { default as AgentLogger } from './AgentLogger';
import { default as json } from 'format-json';
import { default as DynamoDBStream } from 'dynamodb-stream';
import { default as elasticsearch } from 'elasticsearch';
import { schedule } from 'tempus-fugit';
import { AgentUtils } from './AgentUtils';
import { default as rp } from 'request-promise-native';
import { version as agentVersion } from '../../../package.json';
const agentGroup = process.env.GTM_AGENT_GROUP || 'default';

AWS.config.update({ region: process.env.GTM_AWS_REGION });

let log = AgentLogger.log();
const EVENTS_TABLE = process.env.GTM_DYNAMO_TABLE_EVENTS;
let INITIAL_DATA = [];
let EventMetricStream;

let elastic;
if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
    elastic = new elasticsearch.Client({
        host: `${process.env.GTM_ELASTIC_HOST}:${process.env.GTM_ELASTIC_PORT}`,
        log: 'info'
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

    app.get('/metrics/health', async (req, res) => {
        let includeDetail = false;
        let result = await getHealth(includeDetail);
        res.json(result);
        res.end();
    });

    app.get('/metrics/health/detail', async (req, res) => {
        let includeDetail = true;
        let result = await getHealth(includeDetail);
        res.json(result);
        res.end();
    });

    async function getHealth(includeDetails) {
        return {
            agent: getAgentInfo(includeDetails),
            node: getProcessInfo(includeDetails),
            elastic: await getElasticInfo(includeDetails),
            dynamodb: await getDynamoInfo(includeDetails),
            sqs: await getSQSInfo(includeDetails)
        };
    }

    function getAgentInfo(includeDetails) {
        let result = {
            id: AgentUtils.agentId(),
            version: agentVersion,
            group: agentGroup
        };
        if (includeDetails) {
            result.env = getEnvParams();
        }
        return result;
    }

    async function getElasticInfo(includeDetails) {
        let result = 'not configured';
        if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
            result = await rp({
                json: true,
                uri: `http://${process.env.GTM_ELASTIC_HOST}:${process.env.GTM_ELASTIC_PORT}`
            });
            if (!includeDetails) {
                result = 'found';
            }
        }
        return result;
    }

    async function getSQSInfo(includeDetails) {
        let sqsPendingStats = await describeQueue(process.env.GTM_SQS_PENDING_QUEUE, ['All'], true);
        let sqsResultsStats = await describeQueue(process.env.GTM_SQS_RESULTS_QUEUE, ['All'], true);
        if (!includeDetails) {
            sqsPendingStats = 'found';
            sqsResultsStats = 'found';
        }
        return {
            pending: sqsPendingStats,
            results: sqsResultsStats
        };
    }

    async function getDynamoInfo(includeDetails) {
        let result = 'not configured';
        if (EVENTS_TABLE) {
            result = {
                events: await ddb.describeTable({ TableName: EVENTS_TABLE }).promise()
            };
            if (!includeDetails) {
                result = 'found';
            }
        }
        return result;
    }

    function getProcessInfo() {
        return {
            version: process.version,
            pid: process.pid,
            uptime: process.uptime(),
            cpuUsage: process.cpuUsage(),
            memoryUsage: process.memoryUsage()
        };
    }

    function getEnvParams() {
        let env = {};
        Object.keys(process.env)
            .sort()
            .forEach(key => {
                if (key.startsWith('GTM')) {
                    env[key] = AgentUtils.varMask(key, process.env[key]);
                }
            });
        return env;
    }

    async function describeQueue(queueName, attributeNameArray, includeDetails) {
        let sqs = new AWS.SQS();
        if (!includeDetails) {
            return 'found';
        }
        let queueUrl = await sqs.getQueueUrl({ QueueName: queueName }).promise();
        log.debug(`sqs queue url ${queueName}: ${json.plain(queueUrl)}`);
        if (!attributeNameArray) attributeNameArray = ['All'];
        let sqsQueueParams = {
            QueueUrl: queueUrl.QueueUrl,
            AttributeNames: attributeNameArray
        };
        let queueDetails = await sqs.getQueueAttributes(sqsQueueParams).promise();

        let result = {};
        result.name = queueName;
        result.url = queueUrl.QueueUrl;
        result.attributes = queueDetails.Attributes;
        log.debug(`sqs queue details: ${result}`);
        return result;
    }
}

module.exports = {
    configureRoutes: configureRoutes
};

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
import { default as proxy } from 'proxy-agent';
import { default as https } from 'https';

const agentGroup = process.env.GTM_AGENT_GROUP || 'default';

AWS.config.update({ region: process.env.GTM_AWS_REGION });

let log = AgentLogger.log();
const EVENTS_TABLE = process.env.GTM_DYNAMO_TABLE_EVENTS;
const AGENTS_TABLE = process.env.GTM_DYNAMO_TABLE_AGENTS;
let INITIAL_DATA = [];
INITIAL_DATA[EVENTS_TABLE] = [];
INITIAL_DATA[AGENTS_TABLE] = [];

let elastic;
if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
    elastic = new elasticsearch.Client({
        host: `${process.env.GTM_ELASTIC_HOST}:${process.env.GTM_ELASTIC_PORT}`,
        log: 'info'
    });
}

if (process.env.IAM_ENABLED) {
    AWS.config.update({
        httpOptions: {
            agent: proxy(process.env.HTTP_PROXY)
        }
    });
}

let sns = new AWS.SNS({ apiVersion: '2010-03-31' });
let AGENT_SNS_ARN;

export class AgentMetrics {
    static async configureRoutes(app) {
        let ddb;
        if (process.env.GTM_DYNAMO_VPCE) {
            log.info('Configuring DynamoDB to use VPC Endpoint');
            ddb = new AWS.DynamoDB({
                httpOptions: {
                    agent: new https.Agent()
                }
            });
        } else {
            log.info('Configuring DynamoDB to use Global AWS Config');
            ddb = new AWS.DynamoDB();
        }

        await this.bridgeStreams(app, ddb, EVENTS_TABLE, '/metrics/stream');
        await this.bridgeStreams(app, ddb, AGENTS_TABLE, '/metrics/agents/stream');

        app.get('/metrics', (req, res) => {
            res.render('metrics.html');
        });

        app.get('/metrics/log/gtm-:ghEventId.txt', async (req, res) => {
            if (!elastic) {
                res.write('elasticsearch is not configured');
                res.end();
                return;
            }

            let ghEventId = req.params.ghEventId;
            let logs = await this.getEventLogs(ghEventId);

            logs.forEach(log => {
                res.write(`${log._source['@timestamp']} ${log._source.message} \n`);
            });

            res.end();
        });

        app.get('/metrics/log/gtm-:ghEventId.json', async (req, res) => {
            if (!elastic) {
                res.json({ error: 'elasticsearch is not configured' });
                res.end();
                return;
            }

            let ghEventId = req.params.ghEventId;
            let logs = await this.getEventLogs(ghEventId);
            res.json(logs);
        });

        app.get('/metrics/health', async (req, res) => {
            let includeDetail = false;
            let result = await this.getHealth(ddb, includeDetail);
            res.json(result);
            res.end();
        });

        app.get('/metrics/health/detail', async (req, res) => {
            let includeDetail = true;
            let result = await this.getHealth(ddb, includeDetail);
            res.json(result);
            res.end();
        });

        app.get('/metrics/agent/kill/:agentId', async (req, res) => {
            let agentId = req.params.agentId;
            log.info(`sending kill code for agent: ${agentId}`);
            let result = await this.broadcastKill(agentId);
            res.json(result);
            res.end();
        });

        app.get('/metrics/agent/info/:agentId', async (req, res) => {
            let agentId = req.params.agentId || '*';
            log.info(`sending info request to all agents`);
            let result = await this.broadcastInfoRequest(agentId);
            res.json(result);
            res.end();
        });
    }

    static async bridgeStreams(app, ddb, tableName, uri) {
        let ddbEventStream = await this.getDDBStream(ddb, tableName);

        // fetch stream state initially
        ddbEventStream.fetchStreamState(async err => {
            if (err) {
                log.error(err);
                return;
            }

            let ddbDocClient = new AWS.DynamoDB.DocumentClient({
                convertEmptyValues: true,
                service: ddb
            });

            // fetch initial data
            let eventData = await ddbDocClient.scan({ TableName: tableName }).promise();
            INITIAL_DATA[tableName] = eventData.Items;
            log.debug(`Initial data for ${tableName}: ${json.plain(INITIAL_DATA[tableName])}`);

            // poll
            schedule({ second: 10 }, function(job) {
                ddbEventStream.fetchStreamState(job.callback());
            });

            let sseEventStream = new ExpressSSE(INITIAL_DATA[tableName]);
            app.get(uri, sseEventStream.init);

            ddbEventStream.on('insert record', eventObject => {
                log.debug(`inserted ${json.plain(eventObject)}`);
                INITIAL_DATA[tableName].push(eventObject);
                sseEventStream.updateInit(INITIAL_DATA[tableName]);
                sseEventStream.send(eventObject);
            });

            ddbEventStream.on('modify record', eventObject => {
                log.debug(`updated ${json.plain(eventObject)}`);
                INITIAL_DATA[tableName].push(eventObject);
                sseEventStream.updateInit(INITIAL_DATA[tableName]);
                sseEventStream.send(eventObject);
            });
        });
    }

    static async getDDBStream(ddb, tableName) {
        let tableDetails = await ddb.describeTable({ TableName: tableName }).promise();
        log.debug(json.plain(tableDetails));
        let tableStreamArn = tableDetails.Table.LatestStreamArn;
        let ddbStream = new DynamoDBStream(new AWS.DynamoDBStreams(), tableStreamArn);
        ddbStream.on('error', err => {
            log.error(err);
        });

        ddbStream.on('end', () => {
            log.info(`stream closed`);
        });
        return ddbStream;
    }

    static async getEventLogs(ghEventId) {
        let results = await elastic.search({
            index: 'logstash*',
            size: 10000,
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

    static async getHealth(ddb, includeDetails) {
        return {
            agent: this.getAgentInfo(includeDetails),
            node: this.getProcessInfo(includeDetails),
            elastic: await this.getElasticInfo(includeDetails),
            dynamodb: await this.getDynamoInfo(ddb, includeDetails),
            sqs: await this.getSQSInfo(includeDetails)
        };
    }

    static async getAgentInfo(includeDetails) {
        let result = {
            id: AgentUtils.agentId(),
            version: agentVersion,
            group: agentGroup
        };
        if (includeDetails) {
            result.env = this.getEnvParams();
        }
        return result;
    }

    static async getElasticInfo(includeDetails) {
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

    static async getSQSInfo(includeDetails) {
        let sqsPendingStats = await this.describeQueue(process.env.GTM_SQS_PENDING_QUEUE, ['All'], true);
        let sqsResultsStats = await this.describeQueue(process.env.GTM_SQS_RESULTS_QUEUE, ['All'], true);
        if (!includeDetails) {
            sqsPendingStats = 'found';
            sqsResultsStats = 'found';
        }
        return {
            pending: sqsPendingStats,
            results: sqsResultsStats
        };
    }

    static async getDynamoInfo(ddb, includeDetails) {
        let eventsTableStatus = await ddb.describeTable({ TableName: EVENTS_TABLE }).promise();
        let agentsTableStatus = await ddb.describeTable({ TableName: AGENTS_TABLE }).promise();

        if (!includeDetails) {
            eventsTableStatus = 'found';
            agentsTableStatus = 'found';
        }

        return {
            events: eventsTableStatus,
            agents: agentsTableStatus
        };
    }

    static getProcessInfo() {
        return {
            version: process.version,
            pid: process.pid,
            uptime: process.uptime(),
            cpuUsage: process.cpuUsage(),
            memoryUsage: process.memoryUsage()
        };
    }

    static getEnvParams() {
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

    static async describeQueue(queueName, attributeNameArray, includeDetails) {
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

    static async broadcast(message) {
        return sns
            .createTopic({
                Name: process.env.GTM_SNS_AGENTS_TOPIC
            })
            .promise()
            .then(data => {
                let topicArn = data.TopicArn;
                let params = {
                    Message: message,
                    TopicArn: topicArn
                };
                return Promise.resolve(params);
            })
            .then(params => {
                return sns.publish(params).promise();
            });
    }

    static async broadcastKill(agentId) {
        let msg = {
            action: 'KILL',
            agentId: agentId
        };
        return await this.broadcast(msg);
    }

    static async broadcastInfoRequest(agentId) {
        let msg = {
            action: 'INFO',
            agentId: agentId
        };
        return await this.broadcast(msg);
    }

    static async subscribeAgent() {

        sns.subscribe({
            Protocol: 'http',
            //You don't just subscribe to "news", but the whole Amazon Resource Name (ARN)
            TopicArn: AGENT_SNS_ARN,
            Endpoint: '//your-endpoint-url.com'
        }, function( error, data ) {
            console.log( error || data );
        });
    }
}

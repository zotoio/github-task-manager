import { default as JenkinsLib } from 'jenkins';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import KmsUtils from '../KmsUtils';

/**
 * Sample .githubTaskManager.json task config/
 *
 * see: https://github.com/zotoio/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 * {
        "executor": "Jenkins",
        "context": "Build and deploy",
        "options": {
          "jobName": "JENKINS_JOBNAME",
          "parameters": {
            "ENVIRONMENT" : "env_dev"
        }
    }
 */

export class ExecutorJenkins extends Executor {
    constructor(eventData, log) {
        super(eventData, log);
        this.log = log;
        KmsUtils.logger = log;
        this.options = this.getOptions();
    }

    async initJenkins() {
        if (!this.jenkins) {
            // If set, this will return bool:true, else bool:false
            let useCsrf = this.options.GTM_JENKINS_CSRF === 'true';

            this.jenkins = new JenkinsLib({
                baseUrl: AgentUtils.formatBasicAuth(
                    this.options.GTM_JENKINS_USER,
                    await KmsUtils.getDecrypted(this.options.GTM_CRYPT_JENKINS_TOKEN),
                    this.options.GTM_JENKINS_URL,
                ),
                crumbIssuer: useCsrf,
                promisify: true,
            });
        }
        return this.jenkins;
    }

    async waitForBuildToExist(buildName, buildNumber) {
        let log = this.log;
        return new Promise(async (resolve, reject) => {
            let exists = false;
            let maxRetries = 600;
            let tries = 0;
            while (!exists && tries++ < maxRetries) {
                exists = await this.jenkins.build.get(buildName, buildNumber).then(
                    function () {
                        log.info(`Build ${buildName} #${buildNumber} Started!`);
                        return true;
                    },
                    async function () {
                        log.debug(`Build ${buildName} #${buildNumber} Hasn't Started: ${tries}`);
                        await AgentUtils.timeout(10000);
                        return false;
                    },
                );
            }
            exists ? resolve(true) : reject();
        });
    }

    async waitForBuild(buildName, buildNumber) {
        let log = this.log;
        let buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function (data) {
            return data;
        });
        let tries = 1;
        while (buildDict.result === null) {
            await AgentUtils.timeout(5000);
            buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function (data) {
                log.debug(`Waiting for Build '${buildName}' to Finish: ${tries++}`);
                return data;
            });
        }
        log.info(`Build Finished: ${buildName} #${buildNumber} - ${buildDict.result}`);
        return buildDict;
    }

    async buildNumberfromQueue(queueId) {
        let log = this.log;
        try {
            if (!this.jenkins || !this.jenkins.queue) {
                throw new Error('Jenkins client not properly initialized');
            }

            if (!queueId || isNaN(parseInt(queueId))) {
                throw new Error('Queue ID must be a valid number');
            }

            let queueData = await this.jenkins.queue.item(parseInt(queueId)).catch((err) => {
                log.error(`Failed to get queue item: ${err.message}`);
                throw err;
            });

            while (!queueData.executable) {
                try {
                    log.info(`Build Not Ready: ${queueData.why || 'No status available'}`);
                } catch (error) {
                    log.warn(`Build Not Ready: No Reason Provided. Retrying in 3 seconds...`);
                }
                await AgentUtils.timeout(3000);
                queueData = await this.jenkins.queue.item(queueId).catch((err) => {
                    log.error(`Failed to get queue item: ${err.message}`);
                    throw err;
                });
            }

            return queueData.executable.number;
        } catch (error) {
            log.error(`Error in buildNumberfromQueue: ${error.message}`);
            throw error;
        }
    }

    async executeTask(task) {
        this.jenkins = await this.initJenkins();
        let log = this.log;

        // Handle case where task.options is undefined
        if (!task.options) {
            task.options = {};
        }

        let jobName = task.options.jobName || null;
        let buildParams = task.options.parameters || null;
        let configuration = {};

        if (jobName == null) {
            await AgentUtils.timeout(4000);
            task.results = {
                passed: false,
                url: this.options.GTM_JENKINS_URL,
                message: `Required Parameter 'Job Name' not Specified`,
            };
            return Promise.reject(task);
        } else {
            configuration.name = jobName;
        }

        if (buildParams != null && buildParams != []) configuration.parameters = buildParams;

        log.info('Starting Jenkins Job: ' + jobName);
        // TODO: Check if Job Exists
        let buildResponse = await this.jenkins.job.build(configuration);
        // Jenkins may return queue ID as plain text or number
        let queueId = typeof buildResponse === 'string' ? parseInt(buildResponse) : buildResponse;
        if (isNaN(queueId)) {
            throw new Error('Invalid queue ID returned from Jenkins build');
        }
        let buildNumber = await this.buildNumberfromQueue(queueId);
        let buildExists = await this.waitForBuildToExist(jobName, buildNumber);
        console.debug(buildExists);
        let result = await this.waitForBuild(jobName, buildNumber);

        let resultBool = result.result === 'SUCCESS';

        task.results = {
            passed: resultBool,
            url: result.url,
            message: `${jobName} #${buildNumber} - ${result.result}`,
            details: `Job '${jobName} #${buildNumber}' Finished: ${result.result}`,
            meta: {
                jobName: jobName,
                buildNumber: buildNumber,
            },
        };

        return resultBool ? Promise.resolve(task) : Promise.reject(task);
    }
}

Executor.register('Jenkins', ExecutorJenkins);

import { default as JenkinsLib } from 'jenkins';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
let log = AgentUtils.logger();

export class ExecutorJenkins extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        // If set, this will return bool:true, else bool:false
        let useCsrf = this.options.GTM_JENKINS_CSRF === 'true';

        this.jenkins = JenkinsLib({
            baseUrl: AgentUtils.formatBasicAuth(
                this.options.GTM_JENKINS_USER,
                this.options.GTM_JENKINS_TOKEN,
                this.options.GTM_JENKINS_URL
            ),
            crumbIssuer: useCsrf,
            promisify: true
        });
    }

    async waitForBuildToExist(buildName, buildNumber) {
        return new Promise(async (resolve, reject) => {
            let exists = false;
            let maxRetries = 600;
            let tries = 0;
            while (!exists && tries++ < maxRetries) {
                exists = await this.jenkins.build.get(buildName, buildNumber).then(
                    function() {
                        log.info(`Build ${buildName} #${buildNumber} Started!`);
                        return true;
                    },
                    async function() {
                        log.debug(`Build ${buildName} #${buildNumber} Hasn't Started: ${tries}`);
                        await AgentUtils.timeout(10000);
                        return false;
                    }
                );
            }
            exists ? resolve(true) : reject();
        });
    }

    async waitForBuild(buildName, buildNumber) {
        let buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function(data) {
            return data;
        });
        let tries = 1;
        while (buildDict.result === null) {
            await AgentUtils.timeout(5000);
            buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function(data) {
                log.debug(`Waiting for Build '${buildName}' to Finish: ${tries++}`);
                return data;
            });
        }
        log.info(`Build Finished: ${buildName} #${buildNumber} - ${buildDict.result}`);
        return buildDict;
    }

    createJenkinsBuildParams(task) {
        // todo jenkins params by eventType, task options etc
        return {
            TAGS: JSON.stringify(task.options.parameters.tags),
            ENVIRONMENT: task.options.parameters.ENVIRONMENT
        };
    }

    async buildNumberfromQueue(queueId) {
        let queueData = await this.jenkins.queue.item(queueId).then(function(data) {
            return data;
        });
        while (!queueData.executable) {
            try {
                log.info(`Build Not Ready: ${queueData.why}`);
            } catch (error) {
                log.warn(`Build Not Ready: No Reason Provided. Retrying in 3 seconds...`);
            }
            await AgentUtils.timeout(3000);
            queueData = await this.jenkins.queue.item(queueId).then(function(data) {
                return data;
            });
        }
        return queueData.executable.number;
    }

    async executeTask(task) {
        let jobName = task.options.jobName;

        if (jobName == null) {
            await AgentUtils.timeout(4000);
            return 'NO_MATCHING_TASK';
        }

        let buildParams = this.createJenkinsBuildParams(task);
        log.debug(buildParams);

        log.info('Starting Jenkins Job: ' + jobName);
        let queueNumber = await this.jenkins.job.build({
            name: jobName,
            parameters: buildParams
        });
        let buildNumber = await this.buildNumberfromQueue(queueNumber);
        let buildExists = await this.waitForBuildToExist(jobName, buildNumber);
        console.debug(buildExists);
        let result = await this.waitForBuild(jobName, buildNumber);

        let resultBool = result.result === 'SUCCESS';

        let resultSummary = {
            passed: resultBool,
            url: result.url,
            message: `${jobName} #${buildNumber} - ${result.result}`,
            meta: {
                jobName: jobName,
                buildNumber: buildNumber
            }
        };

        task.results = resultSummary;

        return resultBool ? Promise.resolve(task) : Promise.reject(task); // todo handle results
    }
}

Executor.register('Jenkins', ExecutorJenkins);

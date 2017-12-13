import { default as JenkinsLib } from 'jenkins';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class ExecutorJenkins extends Executor {

    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.jenkins = JenkinsLib({
            baseUrl: Utils.formatBasicAuth(
                this.options.GTM_JENKINS_USER,
                this.options.GTM_JENKINS_TOKEN,
                this.options.GTM_JENKINS_URL),
            crumbIssuer: true, promisify: true
        });

    }

    taskNameToBuild(context) {

        let desiredTask = context;
        console.debug(desiredTask);

        let tasks = {
            functional: 'EXECUTE_AUTOMATED_TESTS',
            a11y: 'EXECUTE_AUTOMATED_TESTS'
        };

        if (!tasks.hasOwnProperty(desiredTask)) {
            log.error('No Tasks Matched Request: ' + desiredTask);
            return null;
        } else {
            let mappedTask = tasks[desiredTask];
            log.info('Mapped Task ' + desiredTask + ' to Job ' + mappedTask);
            return mappedTask;
        }
    }

    async waitForBuildToExist(buildName, buildNumber) {
        // TODO: Make this a set amount of time instead of retries
        // or make it wait between each retry
        return new Promise(async (resolve, reject) => {
            let exists = false;
            let maxRetries = 30;
            let tries = 0;
            while (!exists && tries++ < maxRetries) {
                exists = await this.jenkins.build.get(buildName, buildNumber).then(function () {
                    log.info(`Build ${buildName} #${buildNumber} Started!`);
                    return true;
                }, function () {
                    log.debug(`Build ${buildName} #${buildNumber} Hasn't Started: ${tries}`);
                    return false;
                });
            }
            exists ? resolve(true) : reject();
        });

    }

    async waitForBuild(buildName, buildNumber) {
        let buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function (data) {
            return data;
        });
        let tries = 1;
        while (buildDict.result === null) {
            await Utils.timeout(5000);
            buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function (data) {
                log.debug('Waiting for Build \'' + buildName + '\' to Finish: ' + tries++);
                return data;
            });
        }
        log.info(`Build Finished: ${buildName} #${buildNumber} - ${buildDict.result}`);
        return buildDict;
    }

    createJenkinsBuildParams(task) {
        // todo jenkins params by eventType, task options etc
        return {
            TAGS: JSON.stringify(task.options.tags),
            ENVIRONMENT: 'automated-test-env'
        };
    }

    async executeTask(task) {

        let jobName = this.taskNameToBuild(task.context);
        if (jobName == null)
            return 'NO_MATCHING_TASK';

        let buildParams = this.createJenkinsBuildParams(task);
        log.debug(buildParams);

        log.info('Starting Jenkins Job: ' + jobName);
        let buildNumber = await this.jenkins.job.build({ name: jobName, parameters: buildParams });
        let buildExists = await this.waitForBuildToExist(jobName, buildNumber);
        console.debug(buildExists);
        let result = await this.waitForBuild(jobName, buildNumber);

        log.info('Build Finished: ' + result.result);
        let resultBool = result.result === 'SUCCESS';
        return Promise.resolve({ passed: resultBool, url: result.url, buildMessage: `${jobName} #${buildNumber} - ${result.result}` });  // todo handle results
    }

}

Executor.register('Jenkins', ExecutorJenkins);
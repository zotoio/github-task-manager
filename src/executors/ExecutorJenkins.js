import { default as JenkinsLib } from 'jenkins';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
import { default as json } from 'format-json';
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

    static taskNameToBuild(context) {

        let desiredTask = json.plain(context);
        console.debug(desiredTask);

        let tasks = {
            functional: 'EXECUTE_AUTOMATED_TESTS',
            a11y: 'EXECUTE_AUTOMATED_TESTS'
        };

        if (!tasks.hasOwnProperty(desiredTask)) {
            return null;
        } else {
            return tasks[desiredTask];
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
                    return true;
                }, function () {
                    return setTimeout(function () { return false; }, 10000);
                });
            }
            exists ? resolve(true) : reject();
        });

    }

    async waitForBuild(buildName, buildNumber) {
        let buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function (data) {
            return data;
        });
        //let tries = 1;
        while (buildDict.result === null) {
            buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function (data) {
                //log.info('Waiting for Build \'' + buildName + '\' to Finish: ' + tries++);
                return data;
            });
        }
        return buildDict;
    }

    static createJenkinsBuildParams(task) {
        // todo jenkins params by eventType, task options etc
        return {
            TAGS: JSON.stringify(task.options.tags),
            ENVIRONMENT: 'automated-test-env'
        };
    }

    async executeTask(task) {

        log.info(`jenkins options: ${json.plain(task.options)}`);

        let jobName = this.taskNameToBuild(task.context);
        if (!jobName)
            return 'NO_MATCHING_TASK';

        let buildParams = this.createJenkinsBuildParams(task);
        log.debug(buildParams);

        let buildNumber = await this.jenkins.job.build({ name: jobName, parameters: buildParams });
        let result = this.waitForBuildToExist(jobName, buildNumber).then(await this.waitForBuild(jobName, buildNumber));

        log.info('Build Finished: ' + result.result);
        let resultBool = result.result === 'SUCCESS';

        return { passed: resultBool, url: result.url };  // todo handle results
    }

}

Executor.register('Jenkins', ExecutorJenkins);
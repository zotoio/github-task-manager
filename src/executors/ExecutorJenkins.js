import { default as JenkinsLib } from 'jenkins';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class ExecutorJenkins extends Executor {

    constructor(options) {
        super();
        this.options = options;
        this.jenkins = JenkinsLib({ baseUrl: Utils.formatBasicAuth(this.options.username, this.options.password, this.options.url), crumbIssuer: true, promisify: true });
    }

    info() {
        this.executeTask('Functional', {test: 'Testing'});
        return 'Auto-Registered Executor for Jenkins';
    }

    taskNameToBuild(taskName) {
        log.debug(taskName);
        return 'EXECUTE_AUTOMATED_TESTS';
    }

    async waitForBuild(buildName, buildNumber) {
        let buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function(data) {
            return data;
        });
        //let tries = 1;
        while(buildDict.result === null) {
            buildDict = await this.jenkins.build.get(buildName, buildNumber).then(function(data) {
                //log.info('Waiting for Build \'' + buildName + '\' to Finish: ' + tries++);
                return data;
            });
        }
        return buildDict;
    }

    async executeTask(taskName, buildParams) {
        let jobName = this.taskNameToBuild(taskName);
        log.debug(buildParams);
        let buildNumber = await this.jenkins.job.build({ name: jobName, parameters: buildParams });
        let result = await this.waitForBuild(jobName, buildNumber);
        log.info('Build Finished: ' + result.result);
        let resultBool = result.result === 'SUCCESS';
        return { passed: resultBool, url: result.url };  // todo handle results
    }

}

Executor.register('Jenkins', ExecutorJenkins);
import { default as Travis } from 'travis-ci';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class ExecutorTravis extends Executor {

    constructor(options) {
        super();
        this.options = options;
        this.travis = new Travis({
            version: '2.0.0'
        });
    }

    info() {
        this.executeTask('Functional', {test: 'Testing'});
        return 'Auto-Registered Executor for Travis';
    }

    taskNameToBuild(taskName) {
        log.debug(taskName);
        return 'EXECUTE_AUTOMATED_TESTS';
    }

    async executeTask(taskName, eventData, buildParams) {
        //let jobName = this.taskNameToBuild(taskName);

        this.travis.authenticate({
            github_token: process.env.GTM_GITHUB_TOKEN
        }, function (err) {
            if (err) {
                log.error(err);
                return;
            }

            log.info('logged in to travis');
        });

        log.debug(buildParams);
        let result = true;
        log.info('Build Finished: ' + result);
        return result;
    }

}

Executor.register('Travis', ExecutorTravis);
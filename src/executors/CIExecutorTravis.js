import { default as Travis } from 'travis-ci';
import { CIExecutor } from '../lib/CIExecutor';

export class CIExecutorTravis extends CIExecutor {

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
        console.debug(taskName);
        return 'EXECUTE_AUTOMATED_TESTS';
    }

    async executeTask(taskName, buildParams) {
        //let jobName = this.taskNameToBuild(taskName);

        this.travis.authenticate({
            github_token: process.env.GTM_GITHUB_TOKEN
        }, function (err) {
            if (err) {
                console.log(err);
                return;
            }

            console.log('logged in to travis');
        });

        console.debug(buildParams);
        let result = true;
        console.log('Build Finished: ' + result);
        return result;
    }

}

CIExecutor.register('Travis', CIExecutorTravis);
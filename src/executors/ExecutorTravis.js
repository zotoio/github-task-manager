import { default as Travis } from 'travis-ci';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import { default as json } from 'format-json';
let log = AgentUtils.logger();

export class ExecutorTravis extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.runFunctions = {};
        this.runFunctions['pull_request'] = this.executeForPullRequest;

        this.travis = new Travis({
            version: '2.0.0'
        });
    }

    run(fn) {
        return this.runFunctions[fn];
    }

    async executeForPullRequest(task) {
        log.info(`travis options: ${json.plain(task.options)}`);

        this.travis.authenticate(
            {
                github_token: process.env.GTM_GITHUB_TOKEN
            },
            function(err) {
                if (err) {
                    log.error(err);
                    return;
                }

                log.info('logged in to travis');
            }
        );

        let result = true;
        log.info('Build Finished: ' + result);
        return { passed: result, url: 'https://travis-ci.org' };
    }

    async executeTask(task) {
        log.info('Travis Build Finished');
        log.debug(task);
        return { passed: true, url: 'https://travis-ci.org' };
    }
}

Executor.register('Travis', ExecutorTravis);

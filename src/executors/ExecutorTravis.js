import { default as Travis } from 'travis-ci';
import { Executor } from '../agent/Executor';
import { default as json } from 'format-json';
import KmsUtils from '../KmsUtils';

/**
 * Sample .githubTaskManager.json task config - NOT READY FOR USE
 *
 * see: https://github.com/zotoio/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 {
   "executor": "Travis",
   "context": "release",
   "options": {
     "target": "npm"
   }
 }
 */

export class ExecutorTravis extends Executor {
    constructor(eventData, log) {
        super(eventData, log);
        this.log = log;
        KmsUtils.logger = log;
        this.options = this.getOptions();

        this.travis = new Travis({
            version: '2.0.0'
        });
    }

    async executeTask(task) {
        let log = this.log;
        log.info(`travis options: ${json.plain(task.options)}`);

        this.travis.authenticate(
            {
                github_token: KmsUtils.getDecrypted(process.env.GTM_CRYPT_GITHUB_TOKEN)
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

        task.results = { passed: result, url: 'https://travis-ci.org' };
        return result ? Promise.resolve(task) : Promise.reject(task);
    }
}

Executor.register('Travis', ExecutorTravis);

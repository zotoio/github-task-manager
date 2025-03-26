import { Executor } from '../agent/Executor';
import { default as rp } from 'request-promise-native';
import { default as json } from 'format-json';

/**
 * Sample .githubTaskManager.json task config
 *
 * see: https://github.com/zotoio/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 * {
        "executor": "Http",
        "context": "avtest",
        "options": {
          "har": {
            "url": "https://httpbin.org/headers",
            "method": "GET",
            "headers": [
              {
                "name": "accept",
                "value": "application/json"
              }
            ]
          },
          "validator": {
            "type": "bodyJson",
            "objectCheckRef": "headers.Host",
            "objectCheckVal": "httpbin.org"
          }
        }
      }
 */

export class ExecutorHttp extends Executor {
    constructor(eventData, log) {
        super(eventData, log);
        this.log = log;
        this.options = this.getOptions();
    }

    async executeTask(task) {
        let log = this.log;
        let har = task.options.har;

        log.info(`Starting http request..`);

        return this.sendRequest(task, har)
            .then((response) => {
                let res = json.plain(response);
                log.info(res);
                if (this.validate(task, response)) {
                    task.results = {
                        passed: true,
                        message: 'Request completed',
                        url: 'http://www.softwareishard.com/blog/har-12-spec/#request',
                        details: `\n\n**response:**\n\n\`\`\`\n\n${res}\n\`\`\`\n\n`,
                    };
                    return Promise.resolve(task);
                } else {
                    task.results = {
                        passed: false,
                        message: 'Response validation failed',
                        url: 'http://www.softwareishard.com/blog/har-12-spec/#request',
                        details: `\n\n**response:**\n\n\`\`\`\n\n${res}\n\`\`\`\n\n`,
                    };
                    return Promise.reject(task);
                }
            })

            .catch((e) => {
                log.error(e.message);
                task.results = {
                    passed: false,
                    message: 'an unhandled http error occurred',
                    details: e.message,
                    url: 'http://www.softwareishard.com/blog/har-12-spec/#request',
                };
                return Promise.reject(task);
            });
    }
    sendRequest(task, har) {
        return rp({
            proxy: task.options.proxy || this.options.proxy || null,
            resolveWithFullResponse: true,
            har: har,
        });
    }

    validate(task, response) {
        let log = this.log;
        let valid = true;

        if (task.options.validator && task.options.validator.type === 'bodyJson') {
            log.info('validating response: bodyJson');

            try {
                let bodyObj = JSON.parse(response.body);

                let objectCheckRef = task.options.validator.objectCheckRef;
                let objectCheckVal = task.options.validator.objectCheckVal;

                log.info(`checking ${objectCheckRef} === ${objectCheckVal}`);

                valid = objectCheckRef.split('.').reduce((o, i) => o[i], bodyObj) === objectCheckVal;
            } catch (e) {
                log.error('http bodyJson validation failed', e);
                valid = false;
            }
        }

        return valid;
    }
}

Executor.register('Http', ExecutorHttp);

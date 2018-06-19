import { Executor } from '../agent/Executor';
import { default as Docker } from 'dockerode';
import { default as stream } from 'stream';
import { default as fs } from 'fs';
import appRoot from 'app-root-path';

/**
 * Sample .githubTaskManager.json task config
 *
 * see: https://github.com/zotoio/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 {
   "executor": "Docker",
   "context": "run ls in latest alpine",
   "options": {
     "image": "alpine:latest",
     "command": "/bin/ls -ltr /bin",
     "env": {
        "myvar": "myval",
        "var2": "val2"
     },
     "validator": {
        "type": "outputRegex",
        "regex": ".*HOSTNAME.*"
     }
   }
 }
 */

export class ExecutorDocker extends Executor {
    constructor(eventData, log) {
        super(eventData, log);
        this.log = log;
        this.options = this.getOptions();
        this._taskOutputTail = '';
    }

    // will contain last 100 lines of output
    set taskOutputTail(output) {
        this._taskOutputTail = output;
    }

    get taskOutputTail() {
        return this._taskOutputTail;
    }

    validateImage(image) {
        let log = this.log;
        let valid = false;
        let imageList = this.options.GTM_DOCKER_IMAGE_WHITELIST
            ? this.options.GTM_DOCKER_IMAGE_WHITELIST.split(',')
            : [];

        imageList = this.options.GTM_DOCKER_IMAGE_WHITELIST_FILE
            ? fs
                  .readFileSync(appRoot + '/' + this.options.GTM_DOCKER_IMAGE_WHITELIST_FILE, 'utf-8')
                  .toString()
                  .split('\n')
            : imageList;

        if (imageList && imageList.length > 0) {
            imageList.forEach(imagePattern => {
                if (!valid) {
                    let pattern = new RegExp(imagePattern.trim());
                    if (pattern.test(image)) {
                        log.info(`matched whitelist image pattern '${imagePattern.trim()}'`);
                        valid = true;
                    }
                }
            });
        }
        return valid;
    }

    formatEnv(envObj) {
        let envArray = [];
        Object.keys(envObj).forEach(key => {
            envArray.push(`${key}=${envObj[key]}`);
        });
        // be careful logging here as values will be decrypted
        return envArray;
    }

    async executeTask(task) {
        let log = this.log;
        let image = task.options.image;
        let command = task.options.command;
        let env = task.options.env || {};

        if (
            command &&
            (!this.options.GTM_DOCKER_COMMANDS_ALLOWED || this.options.GTM_DOCKER_COMMANDS_ALLOWED !== 'true')
        ) {
            let message = `docker image commands are not allowed with the current configuration.`;
            log.error(message);
            let resultSummary = {
                passed: false,
                url: 'https://github.com/apocas/dockerode',
                message: message
            };

            task.results = resultSummary;

            return Promise.reject(task);
        }

        if (!this.validateImage(image)) {
            let message = `image '${image}' is not whitelisted.`;
            log.error(message);
            let resultSummary = {
                passed: false,
                url: 'https://github.com/apocas/dockerode',
                message: message
            };

            task.results = resultSummary;

            return Promise.reject(task);
        }

        log.info(`Starting local docker container '${image}' to run: ${command}`);

        let docker = new Docker();
        let that = this;

        return this.pullImage(docker, image)
            .then(() => {
                return docker.createContainer({
                    Image: image,
                    Cmd: command,
                    Env: this.formatEnv(env)
                });
            })

            .then(container => {
                return container.start();
            })

            .then(container => {
                return this.containerLogs(that, container);
            })

            .then(taskOutput => {
                let resultSummary;
                let lines = taskOutput.split('\n');
                let lineCount = lines.length - 1;
                let tail = lineCount <= 30 ? taskOutput : lines.slice(-30).join('\n');
                if (!this.validate(task, taskOutput)) {
                    resultSummary = {
                        passed: false,
                        url: 'https://github.com/apocas/dockerode',
                        message: `Docker output validation failed for ${task.options.validator.type}`,
                        details: `\n\n**output tail (${lineCount} lines total):**\n\n\`\`\`\n...\n${tail}\n\`\`\`\n\n`
                    };
                } else {
                    resultSummary = {
                        passed: true,
                        url: 'https://github.com/apocas/dockerode',
                        message: `Execution completed.`,
                        details: `\n\n**output tail (${lineCount} lines total):**\n\n\`\`\`\n...\n${tail}\n\`\`\`\n\n`
                    };
                }

                task.results = resultSummary;

                return Promise.resolve(task);
            })

            .catch(e => {
                log.error(e.message);
                let resultSummary = {
                    passed: false,
                    url: 'https://github.com/apocas/dockerode',
                    message: 'docker execution error',
                    details: e.message
                };

                task.results = resultSummary;
                return Promise.reject(task);
            });
    }

    /**
     * Get logs from running container
     */
    async containerLogs(executor, container) {
        let log = this.log;
        return new Promise(function(resolve, reject) {
            let logBuffer = [];

            // create a single stream for stdin and stdout
            let logStream = new stream.PassThrough();
            logStream.on('data', function(chunk) {
                logBuffer.push(chunk.toString('utf8'));
                if (logBuffer.length % 50 === 0) {
                    let lines = logBuffer.join('');
                    if (lines.length * 4 > 250000) {
                        lines.match(/.{1,50000}/g).forEach(line => {
                            log.info(line);
                        });
                    } else {
                        log.info(lines);
                    }
                    executor.taskOutputTail += lines;
                    logBuffer = [];
                }
            });

            return container.logs(
                {
                    follow: true,
                    stdout: true,
                    stderr: true
                },
                function(err, stream) {
                    if (err) {
                        reject(log.error(err.message));
                    }
                    container.modem.demuxStream(stream, logStream, logStream);
                    stream.on('end', () => {
                        let lines = logBuffer.join('');
                        log.info(lines);
                        executor.taskOutputTail += lines;
                        logBuffer = [];
                        logStream.end('!stop!');

                        log.info('container stopped, removing..');
                        container.remove();

                        resolve(executor.taskOutputTail);
                    });
                }
            );
        });
    }

    pullImage(docker, image) {
        let log = this.log;
        return new Promise((resolve, reject) => {
            if (process.env.GTM_DOCKER_ALLOW_PULL !== 'false') {
                log.debug(`pulling image ${image}..`);
                docker.pull(image, function(err, stream) {
                    if (err) {
                        return reject(err);
                    }

                    docker.modem.followProgress(stream, onFinished, onProgress);

                    function onFinished(err, output) {
                        if (err) {
                            return reject(err);
                        }
                        return resolve(output);
                    }

                    function onProgress(event) {
                        log.info(event);
                    }
                });
            } else {
                return resolve(true);
            }
        });
    }

    validate(task, output) {
        let log = this.log;
        let valid = true;

        if (task.options.validator && task.options.validator.type === 'outputRegex') {
            log.info('validating docker output: outputRegex');

            try {
                let regex = task.options.validator.regex;

                log.debug(`checking ${regex} matches ${output}`);

                let pattern = new RegExp(regex);
                if (!pattern.test(output)) {
                    log.error(`docker stdout/stderr did not match regex ${regex}`);
                    valid = false;
                }
            } catch (e) {
                log.error('docker outputRegex validation failed', e);
                valid = false;
            }
        }

        return valid;
    }
}

Executor.register('Docker', ExecutorDocker);

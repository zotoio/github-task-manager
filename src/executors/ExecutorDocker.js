import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import { default as Docker } from 'dockerode';
import { default as stream } from 'stream';
import { default as fs } from 'fs';
import appRoot from 'app-root-path';

let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
 *
 * see: https://github.com/wyvern8/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 {
   "executor": "Docker",
   "context": "run ls in latest alpine",
   "options": {
     "image": "alpine:latest",
     "command": ["/bin/ls", "-ltr", "/bin"],
     "env: [
        "myvar=myval",
        "var2=val2"
     ]
   }
 }
 */

export class ExecutorDocker extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();
    }

    validateImage(image) {
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
                let pattern = new RegExp(imagePattern.trim());
                if (pattern.test(image)) {
                    log.info(`matched whitelist image pattern '${imagePattern.trim()}'`);
                    valid = true;
                }
            });
        }
        return valid;
    }

    async executeTask(task) {
        let image = task.options.image;
        let command = task.options.command;
        let env = task.options.env || [];

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

        log.info(`Starting local docker container '${image}' to run: ${command.join(' ')}`);

        let docker = new Docker();

        /**
         * Get logs from running container
         */
        function containerLogs(container) {
            let logBuffer = [];

            // create a single stream for stdin and stdout
            let logStream = new stream.PassThrough();
            logStream.on('data', function(chunk) {
                logBuffer.push(chunk.toString('utf8')); // todo find a better way
                if (logBuffer.length % 100 === 0) {
                    log.info(logBuffer.reverse().join(''));
                    logBuffer = [];
                }
            });

            container.logs(
                {
                    follow: true,
                    stdout: true,
                    stderr: true
                },
                function(err, stream) {
                    if (err) {
                        return log.error(err.message);
                    }
                    container.modem.demuxStream(stream, logStream, logStream);
                    stream.on('end', function() {
                        log.info(logBuffer.reverse().join(''));
                        logBuffer = [];
                        logStream.end('!stop!');
                    });
                }
            );
        }

        function pullImage(image) {
            return new Promise((resolve, reject) => {
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
            });
        }

        return pullImage(image)
            .then(() => {
                return docker.createContainer({
                    Image: image,
                    Cmd: command,
                    Env: env
                });
            })

            .then(container => {
                return container.start({});
            })

            .then(container => {
                return containerLogs(container);
            })

            .then(() => {
                let resultSummary = {
                    passed: true,
                    url: 'https://github.com/apocas/dockerode',
                    message: `execution completed.`,
                    details: 'TODO docker output'
                };

                task.results = resultSummary;

                return Promise.resolve(task); // todo handle results
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
}

Executor.register('Docker', ExecutorDocker);

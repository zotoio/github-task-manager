import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import { default as Docker } from 'dockerode';
import { default as stream } from 'stream';

let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
 *
 {
   "executor": "Docker",
   "context": "run ls in latest alpine",
   "options": {
     "image": "alpine:latest",
     "command": ["/bin/ls", "-ltr", "/bin"]
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
        if (
            !this.options.GTM_DOCKER_IMAGE_WHITELIST ||
            this.options.GTM_DOCKER_IMAGE_WHITELIST.split(',').includes(image)
        ) {
            valid = true;
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
            return Promise.reject({
                passed: false,
                url: 'https://github.com/apocas/dockerode',
                message: message
            });
        }

        if (!this.validateImage(image)) {
            let message = `image '${image} is not whitelisted.`;
            log.error(message);
            return Promise.reject({
                passed: false,
                url: 'https://github.com/apocas/dockerode',
                message: message
            });
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
                        log.error(err.message);
                        reject(err);
                    }

                    docker.modem.followProgress(stream, onFinished, onProgress);

                    function onFinished(err, output) {
                        if (err) {
                            log.error(err.message);
                            reject(err);
                        }
                        resolve(output);
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
                return Promise.resolve({
                    passed: true,
                    url: 'https://github.com/apocas/dockerode'
                });
            })

            .catch(e => {
                log.error(e.message);
                return Promise.reject({
                    passed: false,
                    url: 'https://github.com/apocas/dockerode'
                });
            });
    }
}

Executor.register('Docker', ExecutorDocker);

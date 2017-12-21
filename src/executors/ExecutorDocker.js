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
   "context": "run",
   "options": {
     "image": "node:8",
     "command": ["/bin/ls", "-ltr", "/bin"]
   }
 }
 */

export class ExecutorDocker extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.runFunctions = {};
        this.runFunctions['push'] = this.executeTask;
    }

    run(fn) {
        return this.runFunctions[fn];
    }

    async executeTask(task) {
        let image = task.options.image;
        let command = task.options.command;

        log.info(
            `Starting local docker container '${image}' to run: ${command.join(
                ' '
            )}`
        );

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

                    /*setTimeout(function () {
                    stream.destroy();
                }, 2000);*/
                }
            );
        }

        return docker
            .createContainer({
                Image: image,
                Cmd: command
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
                    url: 'https://docker.com'
                });
            })

            .catch(e => {
                log.error(e.message);
                return Promise.reject({
                    passed: false,
                    url: 'https://docker.com'
                });
            });
    }
}

Executor.register('Docker', ExecutorDocker);

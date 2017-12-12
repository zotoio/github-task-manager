import {Executor} from '../agent/Executor';
import {Utils} from '../agent/AgentUtils';
import {default as Docker} from 'dockerode';
import {default as stream} from 'stream';

let log = Utils.logger();

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

        log.info(`Starting local docker container '${image}' to run: ${command.join(' ')}`);

        let docker = new Docker();

        /**
         * Get logs from running container
         */
        function containerLogs(container) {

            let logBuffer = [];

            // create a single stream for stdin and stdout
            let logStream = new stream.PassThrough();
            logStream.on('data', function (chunk) {
                logBuffer.push(chunk.toString('utf8'));  // todo find a better way
                if (logBuffer.length % 100 === 0) {
                    log.info(logBuffer.join(''));
                    logBuffer = [];
                }

            });

            container.logs({
                follow: true,
                stdout: true,
                stderr: true
            }, function (err, stream) {
                if (err) {
                    return log.error(err.message);
                }
                container.modem.demuxStream(stream, logStream, logStream);
                stream.on('end', function () {
                    log.info(logBuffer.join(''));
                    logBuffer = [];
                    logStream.end('!stop!');
                });

                setTimeout(function () {
                    stream.destroy();
                }, 2000);
            });
        }

        return docker.createContainer({
            Image: image,
            Cmd: command,
        })
            .then((container) => {
                return container.start({});
            })
            .then((container) => {
                return containerLogs(container);
            })
            .then(() => {
                return Promise.resolve({passed: true, url: 'https://docker.com'});
            });

    }

    containerLogs(container) {

        // create a single stream for stdin and stdout
        let logStream = new stream.PassThrough();
        logStream.on('data', function (chunk) {
            log.info(chunk.toString('utf8'));
        });

        return container.logs({
            follow: true,
            stdout: true,
            stderr: true
        })
            .then((stream) => {

                container.modem.demuxStream(stream, logStream, logStream);
                stream.on('end', function () {
                    logStream.end('!stop!');
                });

                setTimeout(function () {
                    stream.destroy();
                }, 2000);
            });

    }

}

Executor.register('Docker', ExecutorDocker);
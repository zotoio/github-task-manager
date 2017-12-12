import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
import { default as Docker } from 'dockerode';
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

        log.info(`starting local docker container ${image} to run ${command}`);

        let docker = new Docker();

        docker.run(image, command, process.stdout).then(function(container) {
            console.log(container.output.StatusCode);
            return container.remove();
        }).then(function() {
            console.log('container removed');
        }).catch(function(err) {
            console.log(err);
        });

        let result = true;
        log.info('Build Finished: ' + result);
        return { passed: result, url: 'https://docker.com' };
    }

}

Executor.register('Docker', ExecutorDocker);
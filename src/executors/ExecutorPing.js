import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class ExecutorPing extends Executor {

    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.run['push'] = this.executeForPush;

    }

    async executeForPush(task) {

        let count = parseInt(task.options.count);

        for (let i = 1; i <= count; i++) {
            let status = Utils.createStatus(
                this.eventData,
                'success',
                'diagnostic',
                `got ping ${i}`
            );
            await Utils.postResultsAndTrigger(
                process.env.GTM_SQS_RESULTS_QUEUE,
                status,
                process.env.GTM_SNS_RESULTS_TOPIC,
                'Ping').then(function () {
                log.info(`sent ping ${i}`);
            });
        }

        let result = true;
        log.info('Build Finished: ' + result);
        return { passed: result, url: 'https://linux.die.net/man/8/ping' };
    }

}

Executor.register('Ping', ExecutorPing);
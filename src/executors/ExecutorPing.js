import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class ExecutorPing extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();
    }

    async executeTask(task) {
        let count = parseInt(task.options.count);

        let promises = [];

        for (let i = 1; i <= count; i++) {
            let status = Utils.createStatus(
                this.eventData,
                'pending',
                'diagnostic',
                `got ping ${i}`
            );

            promises.push(
                Utils.postResultsAndTrigger(
                    process.env.GTM_SQS_RESULTS_QUEUE,
                    status,
                    process.env.GTM_SNS_RESULTS_TOPIC,
                    'Ping'
                ).then(function() {
                    log.info(`sent ping ${i}`);
                })
            );

            await Utils.timeout(3000);
        }

        return Promise.all(promises).then(() => {
            return Promise.resolve({
                passed: true,
                url: `https://ping.io/ping/${task.options.count}`
            });
        });
    }
}

Executor.register('Ping', ExecutorPing);

import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
 *
  {
    "executor": "Ping",
    "context": "diagnostic",
    "options": {
      "count": 3
    }
  }
 */

export class ExecutorPing extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();
    }

    async executeTask(task) {
        let count = parseInt(task.options.count);

        let promises = [];

        for (let i = 1; i <= count; i++) {
            let status = AgentUtils.createPullRequestStatus(
                this.eventData,
                'pending',
                `${task.executor}: ${task.context}`,
                `got ping ${i}`
            );

            promises.push(
                AgentUtils.postResultsAndTrigger(
                    process.env.GTM_SQS_RESULTS_QUEUE,
                    status,
                    process.env.GTM_SNS_RESULTS_TOPIC,
                    'Ping'
                ).then(function() {
                    log.info(`sent ping ${i}`);
                })
            );

            await AgentUtils.timeout(3000);
        }

        return Promise.all(promises).then(() => {
            task.results = {
                passed: true,
                url: `https://ping.io/ping/${task.options.count}`
            };
            return Promise.resolve(task);
        });
    }
}

Executor.register('Ping', ExecutorPing);

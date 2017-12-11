import { EventHandler } from '../agent/EventHandler';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class EventHandlerPullRequest extends EventHandler {

    async handleEvent() {

        let supportedActions = ['opened', 'synchronize'];

        if (!supportedActions.includes(this.eventData.action)) {
            log.error(`unsupported action '${this.eventData.action}'`);
        }

        log.info('-----------------------------');
        log.info('Repository Name: ' + this.eventData.repository.name);
        log.info('Pull Request: ' + this.eventData.pull_request.number);

        // first set each pr check to pending
        await this.setIntialTaskState(this.eventData);

        // now process each task..
        await this.processTasks(this.eventData);

        log.info('event handling completed for pull request');

    }

    async setIntialTaskState(eventData) {

        let that = this;

        this.tasks.forEach(async (task) => {

            let initialState = 'pending';
            let initialDesc = 'Task Execution in Progress';
            if (!Executor.isRegistered(task.executor)) {
                initialState = 'error';
                initialDesc = 'Unknown Executor';
            }

            log.info('\n## Setting Task "' + task.executor + '" to ' + initialState);
            log.info(task);

            let status = Utils.createStatus(
                eventData,
                initialState,
                task.context,
                initialDesc,
                'https://github.com' // fails if not an https url
            );

            await Utils.postResultsAndTrigger(
                process.env.GTM_SQS_RESULTS_QUEUE,
                status,
                process.env.GTM_SNS_RESULTS_TOPIC,
                `Pending for ${that.eventType} - eventId: ${that.eventId}`

            ).then(function () {
                log.info('-----------------------------');
            });
        });
    }

    async processTasks() {

        let that = this;
        this.tasks.forEach(async (task) => {

            if (!Executor.isRegistered(task.executor)) {
                return;
            }

            let executor = Executor.create(task.executor, that.eventData);

            if (!executor.run[that.eventType]) {
                log.info(`Event type '${that.eventType} is not supported by this executor.`);
            }

            let taskResult = await executor.run[that.eventType](task);
            log.info('Task Result: ' + JSON.stringify(taskResult));

            let status = Utils.createStatus(
                that.eventData,
                taskResult.passed ? 'success' : 'error',
                task.context,
                taskResult.passed ? 'Task Completed Successfully' : 'Task Completed with Errors',
                taskResult.url
            );

            await Utils.postResultsAndTrigger(
                process.env.GTM_SQS_RESULTS_QUEUE,
                status,
                process.env.GTM_SNS_RESULTS_TOPIC,
                `Result for ${that.eventType} - eventId: ${that.eventId}`

            ).then(function () {
                log.info('-----------------------------');
            });

        });

    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);
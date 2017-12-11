import { EventHandler } from '../agent/EventHandler';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class EventHandlerPullRequest extends EventHandler {

    async handleEvent() {

        let supportedActions = ['opened', 'synchronize'];

        if (!supportedActions.includes(this.eventData.action)) {
            log.error(`Unsupported Action: '${this.eventData.action}'`);
            return;
        }

        log.info('-----------------------------');
        log.info('Repository Name: ' + this.eventData.repository.name);
        log.info('Pull Request: ' + this.eventData.pull_request.number);

        // first set each pr check to pending
        this.setIntialTaskState(this);

        // now process each task..
        this.processTasks(this);

        log.info('Pull Request Event Handled');

    }

    setIntialTaskState(event) {

        event.tasks.forEach(async (task) => {

            let initialState = 'pending';
            let initialDesc = 'Task Execution in Progress';
            if (!Executor.isRegistered(task.executor)) {
                initialState = 'error';
                initialDesc = 'Unknown Executor: ' + task.executor;
            }

            log.info(`\n## Pull request: setting Task "${task.executor}:${task.context}" to ${initialState}`);
            log.info(task);

            let status = Utils.createStatus(
                event.eventData,
                initialState,
                task.context,
                initialDesc,
                'https://github.com' // fails if not an https url
            );

            Utils.postResultsAndTrigger(
                process.env.GTM_SQS_RESULTS_QUEUE,
                status,
                process.env.GTM_SNS_RESULTS_TOPIC,
                `Pending for ${event.eventType} - eventId: ${event.eventId}`
            ).then(function () {
                log.info('-----------------------------');
            });
        });
    }

    processTasks(event) {

        event.tasks.forEach(async (task) => {

            if (!Executor.isRegistered(task.executor)) {
                return;
            }

            log.info('Creating Executor for Task: ' + task.executor + ':' + task.context);
            let executor = Executor.create(task.executor, event.eventData);

            let taskResult = await executor.executeTask(task);
            let status;
            if (taskResult == 'NO_MATCHING_TASK') {
                status = Utils.createStatus(
                    event.eventData,
                    'error',
                    task.context,
                    'Unknown Task Type: ' + task.context,
                    'https://kuro.neko.ac'
                );
            } else {
                status = Utils.createStatus(
                    event.eventData,
                    taskResult.passed ? 'success' : 'error',
                    task.context,
                    taskResult.passed ? 'Task Completed Successfully' : 'Task Completed with Errors',
                    taskResult.url
                );
            }

            log.info('Task Result: ' + JSON.stringify(taskResult));

            Utils.postResultsAndTrigger(
                process.env.GTM_SQS_RESULTS_QUEUE,
                status,
                process.env.GTM_SNS_RESULTS_TOPIC,
                `Result for ${task.context} - Event ID: ${event.eventId}`
            ).then(function () {
                log.info('-----------------------------');
            });

        });

    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);
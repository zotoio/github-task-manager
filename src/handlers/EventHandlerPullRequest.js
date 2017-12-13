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

        log.info('---------------------------------');
        log.info('Repository Name: ' + this.eventData.repository.name);
        log.info('Pull Request: ' + this.eventData.pull_request.number);
        log.info('---------------------------------');

        // first set each pr check to pending
        let that = this;
        return this.setIntialTaskState(this).then(() => {
            return that.processTasks(that);
        });

    }

    async setIntialTaskState(event) {

        let promises = [];

        event.tasks.forEach(async (task) => {

            let initialState = 'pending';
            let initialDesc = 'Task Execution in Progress';
            if (!Executor.isRegistered(task.executor)) {
                initialState = 'error';
                initialDesc = 'Unknown Executor: ' + task.executor;
            }

            let status = Utils.createStatus(
                event.eventData,
                initialState,
                task.context,
                initialDesc,
                'https://github.com' // fails if not an https url
            );

            promises.push(Utils.postResultsAndTrigger(
                process.env.GTM_SQS_RESULTS_QUEUE,
                status,
                process.env.GTM_SNS_RESULTS_TOPIC,
                `Pending for ${event.eventType} => ${task.executor}:${task.context} - Event ID: ${event.eventId}`

            ).then(function () {
                log.info(task);
                log.info('-----------------------------');
            }));

        });

        return Promise.all(promises);
    }

    async processTasks(event) {

        let promises = [];

        event.tasks.forEach(async (task) => {

            if (!Executor.isRegistered(task.executor)) {
                return;
            }
            log.info('=================================');
            log.info('Creating Executor for Task: ' + task.executor + ':' + task.context);
            let executor = Executor.create(task.executor, event.eventData);

            let status;
            let taskPromise;

            try {
                taskPromise = executor.executeTask(task).then((taskResult) => {

                    if (taskResult === 'NO_MATCHING_TASK') {
                        status = Utils.createStatus(
                            event.eventData,
                            'error',
                            task.context,
                            'Unknown Task Type: ' + task.context,
                            'https://kuro.neko.ac'
                        );
                    } else {
                        let defaultBuildMessage = taskResult.passed ? 'Task Completed Successfully' : 'Task Completed with Errors';
                        let taskResultMessage = taskResult.buildMessage ? taskResult.buildMessage : defaultBuildMessage;
                        status = Utils.createStatus(
                            event.eventData,
                            taskResult.passed ? 'success' : 'error',
                            task.context,
                            taskResultMessage,
                            taskResult.url
                        );
                    }
                    return status;

                }).then((status) => {

                    return Utils.postResultsAndTrigger(
                        process.env.GTM_SQS_RESULTS_QUEUE,
                        status,
                        process.env.GTM_SNS_RESULTS_TOPIC,
                        `Result '${status.state}' for ${event.eventType} => ${task.executor}:${task.context} - Event ID: ${event.eventId}`
                    );

                }).catch(() => {

                    status = Utils.createStatus(
                        event.eventData,
                        'error',
                        task.context,
                        'Task execution failure'
                    );

                    return Utils.postResultsAndTrigger(
                        process.env.GTM_SQS_RESULTS_QUEUE,
                        status,
                        process.env.GTM_SNS_RESULTS_TOPIC,
                        `Result 'error' for ${event.eventType} => ${task.executor}:${task.context} - Event ID: ${event.eventId}`
                    );

                });

            } catch (e) {
                taskPromise = Promise.reject(e.message);
            }

            promises.push(taskPromise);

        });

        return Promise.all(promises);

    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);
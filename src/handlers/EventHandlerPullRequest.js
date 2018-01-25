import { EventHandler } from '../agent/EventHandler';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
let log = AgentUtils.logger();

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

        this.tasks = AgentUtils.templateReplace(AgentUtils.createBasicTemplate(this.eventData), this.tasks);

        return this.handleTasks(this, this).then(() => {
            //return Promise.resolve(true);
            return this.addPullRequestComment(this);
        });
    }

    /**
     * 1. set all PR status to 'pending'
     * 2. wait a few seconds to allow SQS events to set status.  update when FIFO SQS available
     * 3. process all tasks and update each PR check status
     *
     * @param event - the current event being processed
     * @param parent - current task, which is also the parent of the 'tasks' array if defined
     * @returns {Promise<T>}
     */
    async handleTasks(event, parent) {
        return this.setIntialTaskState(event, parent).then(() => {
            return AgentUtils.timeout(4000).then(() => {
                return this.processTasks(event, parent);
            });
        });
    }

    /**
     * <details>
     * <summary>TestResult A : PASS</summary>
     * <p>
     * this is a summary of the result with a <a href="https://www.google.com.au">link</a> to more info.
     * </p>
     * </details>
     * @param task
     * @param depth
     * @param commentBody
     * @returns {*}
     */
    static buildEventSummary(task, depth, commentBody) {
        if (!task.disabled && task.results && task.results.message) {
            commentBody += `<summary>${task.executor} : ${task.context} (${task.hash}) ${
                task.results.message
            }</summary>\n`;
            commentBody += `<p>${task.results.url} : TODO details..`;
            if (task.tasks) {
                commentBody += `<details>`;
                task.tasks.forEach(subtask => {
                    commentBody = EventHandlerPullRequest.buildEventSummary(subtask, depth++, commentBody);
                });
                commentBody += `</details>`;
            }
            commentBody += `</p>`;
        }
        return commentBody;
    }

    async addPullRequestComment(event) {
        let commentBody = '';
        event.tasks.forEach(task => {
            commentBody += `<details>${EventHandlerPullRequest.buildEventSummary(task, 0, '')}</details>`;
        });

        if (commentBody === '') commentBody = 'no comment';
        log.info(`adding PR comment: ${commentBody}`);

        let status = AgentUtils.createPullRequestStatus(event.eventData, 'N/A', 'COMMENT_ONLY', commentBody);

        return AgentUtils.postResultsAndTrigger(
            process.env.GTM_SQS_RESULTS_QUEUE,
            status,
            process.env.GTM_SNS_RESULTS_TOPIC,
            `Result for ${event.eventType} => Event ID: ${event.eventId}<br/>`
        ).then(function() {
            log.info('PR comment queued.');
            log.info('-----------------------------');
        });
    }

    async setIntialTaskState(event, parent) {
        let promises = [];

        if (parent.tasks) {
            parent.tasks.forEach(async task => {
                if (task.disabled) {
                    return;
                }

                let initialState = 'pending';
                let initialDesc = 'Task Execution in Progress';

                if (!Executor.isRegistered(task.executor)) {
                    initialState = 'error';
                    initialDesc = 'Unknown Executor: ' + task.executor;
                }

                if (!parent.hash) {
                    log.info('No Parent Hash Found. Creating Child Hash');
                    task.hash = AgentUtils.createMd5Hash(task);
                } else {
                    log.info('Parent Hash Found. Appending to Child Hash');
                    task.hash = AgentUtils.createMd5Hash(task, parent.hash);
                }

                let eventContext = `${task.executor}: ${task.context} (${task.hash})`;

                let status = AgentUtils.createPullRequestStatus(
                    event.eventData,
                    initialState,
                    eventContext,
                    initialDesc,
                    'https://github.com' // fails if not an https url
                );

                promises.push(
                    AgentUtils.postResultsAndTrigger(
                        process.env.GTM_SQS_RESULTS_QUEUE,
                        status,
                        process.env.GTM_SNS_RESULTS_TOPIC,
                        `Pending for ${event.eventType} => ${task.executor}:${task.context} - Event ID: ${
                            event.eventId
                        }`
                    ).then(function() {
                        log.info(task);
                        log.info('-----------------------------');
                    })
                );
            });
        }

        return Promise.all(promises);
    }

    async processTasks(event, parent) {
        let promises = [];

        if (parent.tasks) {
            parent.tasks.forEach(async task => {
                if (task.disabled || !Executor.isRegistered(task.executor)) {
                    return;
                }

                let eventContext = `${task.executor}: ${task.context} (${task.hash})`;

                log.info('=================================');
                log.info('Creating Executor for Task: ' + task.executor + ':' + task.context);
                let executor = Executor.create(task.executor, event.eventData);

                let status;
                let taskPromise;

                try {
                    taskPromise = executor
                        .executeTask(task)
                        .then(taskResult => {
                            if (taskResult === 'NO_MATCHING_TASK') {
                                status = AgentUtils.createPullRequestStatus(
                                    event.eventData,
                                    'error',
                                    eventContext,
                                    'Unknown Task Type: ' + task.context,
                                    'https://kuro.neko.ac'
                                );
                            } else {
                                let defaultResultMessage = taskResult.passed
                                    ? 'Task Completed Successfully'
                                    : 'Task Completed with Errors';
                                let taskResultMessage = taskResult.message || defaultResultMessage;
                                status = AgentUtils.createPullRequestStatus(
                                    event.eventData,
                                    taskResult.passed ? 'success' : 'error',
                                    eventContext,
                                    taskResultMessage,
                                    taskResult.url
                                );
                            }
                            return status;
                        })
                        .then(status => {
                            return AgentUtils.postResultsAndTrigger(
                                process.env.GTM_SQS_RESULTS_QUEUE,
                                status,
                                process.env.GTM_SNS_RESULTS_TOPIC,
                                `Result '${status.state}' for ${event.eventType} => ${task.executor}:${
                                    task.context
                                } - Event ID: ${event.eventId}`
                            );
                        })
                        .catch(e => {
                            log.error(e);
                            status = AgentUtils.createPullRequestStatus(
                                event.eventData,
                                'error',
                                eventContext,
                                'Task execution failure'
                            );

                            return AgentUtils.postResultsAndTrigger(
                                process.env.GTM_SQS_RESULTS_QUEUE,
                                status,
                                process.env.GTM_SNS_RESULTS_TOPIC,
                                `Result 'error' for ${event.eventType} => ${task.executor}:${
                                    task.context
                                } - Event ID: ${event.eventId}`
                            );
                        });
                } catch (e) {
                    log.error(e);
                    taskPromise = Promise.reject(e.message);
                }

                promises.push(taskPromise);
            });
        }

        return Promise.all(promises).then(() => {
            let promises = [];
            parent.tasks.forEach(async newParent => {
                if (!newParent.disabled && newParent.tasks) {
                    log.info(`Task ${newParent.executor}:${newParent.context} has Sub-Tasks. Processing..`);
                    promises.push(
                        event.handleTasks(event, newParent).then(() => {
                            log.info(`Sub-Tasks for ${newParent.executor}:${newParent.context} Completed.`);
                        })
                    );
                }
            });
            return Promise.all(promises);
        });
    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);

import { EventHandler } from '../agent/EventHandler';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import { default as formatJson } from 'format-json';

export class EventHandlerPullRequest extends EventHandler {
    async handleEvent() {
        let log = this.log;
        let supportedActions = ['opened', 'synchronize'];

        if (!supportedActions.includes(this.eventData.action)) {
            log.error(`Unsupported Action: '${this.eventData.action}'`);
            return;
        }

        log.info('---------------------------------');
        log.info('Repository Name: ' + this.eventData.repository.full_name);
        log.info('Pull Request: ' + this.eventData.pull_request.number);
        log.info('---------------------------------');

        return this.handleTasks(this, this).then(() => {
            return this.addPullRequestSummaryComment(this).then(event => {
                log.info({
                    resultType: 'EVENT',
                    repo: event.eventData.repository.full_name,
                    url: event.eventData.pull_request.html_url,
                    failed: event.failed || false
                });
            });
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
            return AgentUtils.timeout(10000).then(() => {
                return this.processTasks(event, parent);
            });
        });
    }

    async setIntialTaskState(event, parent) {
        let promises = [];
        let log = this.log;

        if (parent.tasks) {
            parent.tasks.forEach(async task => {
                if (task.disabled) {
                    log.warn(`skipping disabled task ${event.eventType} => ${task.executor}:${task.context}`);
                    return;
                }

                task.options = AgentUtils.templateReplace(
                    AgentUtils.createBasicTemplate(this.eventData, parent, log),
                    task.options,
                    log
                );

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
                        status,
                        `Pending for ${event.eventType} => ${task.executor}:${task.context} - Event ID: ${
                            event.eventId
                        }`,
                        log
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
        let log = this.log;

        if (parent.tasks) {
            parent.tasks.forEach(async task => {
                if (task.disabled) {
                    log.warn(`task disabled: ${task.executor}: ${task.context}`);
                    return;
                }

                if (!Executor.isRegistered(task.executor)) {
                    log.error(`executor not registered: ${task.executor}: ${task.context}`);
                    return;
                }

                let eventContext = `${task.executor}: ${task.context} (${task.hash})`;

                log.info('=================================');
                log.info('Creating Executor for Task: ' + task.executor + ':' + task.context);
                let executor = Executor.create(task.executor, event.eventData, event.log);

                let status;
                let taskPromise;

                try {
                    taskPromise = executor
                        .executeTask(task)
                        .then(task => {
                            if (task.results === 'NO_MATCHING_TASK') {
                                status = AgentUtils.createPullRequestStatus(
                                    event.eventData,
                                    'error',
                                    eventContext,
                                    'Unknown Task Type: ' + task.context,
                                    'https://kuro.neko.ac'
                                );
                            } else {
                                let defaultResultMessage = task.results.passed
                                    ? 'Task Completed Successfully'
                                    : 'Task Completed with Errors';
                                let taskResultMessage = task.results.message || defaultResultMessage;
                                status = AgentUtils.createPullRequestStatus(
                                    event.eventData,
                                    task.results.passed ? 'success' : 'error',
                                    eventContext,
                                    taskResultMessage,
                                    task.results.url
                                );
                            }
                            return status;
                        })
                        .then(status => {
                            this.handleTaskResult(event, task, log);

                            return AgentUtils.postResultsAndTrigger(
                                status,
                                `Result '${status.state}' for ${event.eventType} => ${task.executor}:${
                                    task.context
                                } - Event ID: ${event.eventId}`,
                                log
                            );
                        })
                        .then(() => {
                            return task;
                        })
                        .catch(e => {
                            log.error(e);
                            status = AgentUtils.createPullRequestStatus(
                                event.eventData,
                                'error',
                                eventContext,
                                'Task execution failure',
                                task.results.url
                            );

                            this.handleTaskResult(event, task, log);

                            return AgentUtils.postResultsAndTrigger(
                                status,
                                `Result 'error' for ${event.eventType} => ${task.executor}:${
                                    task.context
                                } - Event ID: ${event.eventId}`,
                                log
                            )
                                .then(() => {
                                    let commentBody = `Task failed: '${task.executor}: ${
                                        task.context
                                    }', any subtasks have been skipped. Config: \n\`\`\`json\n${formatJson.plain(
                                        task
                                    )}\n\`\`\``;
                                    return this.addPullRequestComment(event, commentBody, task);
                                })
                                .then(() => {
                                    return task;
                                });
                        });
                } catch (e) {
                    log.error(e);

                    this.handleTaskResult(event, task, log);

                    taskPromise = Promise.reject(e.message);
                }

                promises.push(taskPromise);
            });
        }

        return this.handleSubtasks(event, promises);
    }

    /**
     * Deal with subtasks of each promise from current task array
     *
     * @param event - current event being processed
     * @param promises from current task array
     * @returns {Promise<[any]>} promises for subtasks resolved via Promise.all
     */
    handleSubtasks(event, promises) {
        let subtaskPromises = [];
        let log = this.log;

        promises.forEach(async promise => {
            // for each sibling task
            subtaskPromises.push(
                //..wait for task to complete
                promise.then(async task => {
                    //.. if there are subtasks
                    if (!task.disabled && task.tasks) {
                        //..and the task failed, skip subtasks
                        log.info(`${task.executor}: ${task.context} #${task.hash} passed? ${task.results.passed}`);
                        if (!task.results.passed) {
                            log.error(
                                `A parent task failed: '${task.executor}: ${task.context}', so subtasks were skipped.`
                            );
                            return;
                        }

                        //..otherwise process subtasks
                        log.info(`Task ${task.executor}:${task.context} has Sub-Tasks. Processing..`);
                        return event.handleTasks(event, task).then(() => {
                            //..and wait for those too.
                            log.info(`Sub-Tasks for ${task.executor}:${task.context} Completed.`);
                        });
                    }
                })
            );
        });
        return Promise.all(subtaskPromises);
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
            commentBody += `<p>${task.results.details || ''}\n${task.results.url || ''}`;
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

    async addPullRequestComment(event, commentBody, task) {
        let log = this.log;
        // don't add comment to PR if disabled for this event type, or disabled for current task
        if (!event.taskConfig.pull_request.disableComments && (!task || !task.disableComments)) {
            if (commentBody === '') commentBody = 'no comment';
            log.info(`adding PR comment: ${commentBody}`);

            let status = AgentUtils.createPullRequestStatus(event.eventData, 'N/A', 'COMMENT_ONLY', commentBody);

            return AgentUtils.postResultsAndTrigger(
                status,
                `Result for ${event.eventType} => Event ID: ${event.eventId}<br/>`,
                log
            ).then(function() {
                log.info('PR comment queued.');
                log.info('-----------------------------');
                return event;
            });
        } else {
            log.info(`skipping PR comment per .githubTaskManager.json`);
        }
    }

    async addPullRequestSummaryComment(event) {
        let commentBody = '';
        event.tasks.forEach(task => {
            commentBody += `<details>${EventHandlerPullRequest.buildEventSummary(task, 0, '')}</details>`;
        });

        return this.addPullRequestComment(event, commentBody);
    }

    handleTaskResult(event, task, log) {
        if (!task.results.passed) event.failed = true;
        log.info({
            resultType: 'TASK',
            repo: event.eventData.repository.full_name,
            url: event.eventData.pull_request.html_url,
            executor: task.executor,
            context: task.context,
            failed: !task.results.passed
        });
    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);

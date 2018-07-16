'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';
import { default as formatJson } from 'format-json';
import { Executor } from './Executor';
import { AgentUtils } from './AgentUtils';
import { default as _ } from 'lodash';
import { default as fs } from 'fs';

export class EventHandler extends Plugin {
    constructor(eventData, log) {
        super();
        this.log = log;

        log.debug(`incoming event: ${formatJson.plain(eventData)}`);

        this.eventId = eventData.ghEventId;
        this.eventType = eventData.ghEventType;
        this.taskConfig = eventData.ghTaskConfig;
        this.eventData = eventData;
        this.MessageHandle = eventData.MessageHandle;

        // Handle Older Task Format
        try {
            this.tasks = this.taskConfig[this.eventType].tasks;
        } catch (error) {
            log.error('No Tasks Defined for Event Type ' + this.eventType);
            log.debug(error);
            this.tasks = {};
        }

        log.info('----------------------------');
        log.info('New Event Received');
        log.info('Event ID: ' + this.eventId);
        log.info('Event Type: ' + this.eventType);
        log.info('Tasks: ' + formatJson.plain(this.tasks));
        log.debug(eventData);
    }

    async handleEvent() {
        let log = this.log;
        let startTime = new Date().getTime();

        if (this.eventType === 'pull_request') {
            let supportedActions = ['opened', 'synchronize'];

            if (!supportedActions.includes(this.eventData.action)) {
                log.error(`Unsupported Action: '${this.eventData.action}'`);
                return;
            }
        }

        log.info({
            resultType: 'START',
            eventType: this.eventType,
            repo: this.eventData.repository.full_name,
            url: this.getEventUrl(),
            pullTitle: this.eventData.pull_request ? this.eventData.pull_request.title : 'n/a',
            pullNumber: this.eventData.pull_request ? this.eventData.pull_request.number : 'n/a',
            sha: this.getEventHeadSha(),
            eventUser: this.getEventUser(),
            agentId: AgentUtils.agentId()
        });

        console.log(this.eventData.pull_request);
        let eventDesc = this.eventData.pull_request
            ? 'Pull Request# ' + this.eventData.pull_request.number
            : 'Commit SHA ' + this.eventData.after;

        log.info('---------------------------------');
        log.info('Repository Name: ' + this.eventData.repository.full_name);
        log.info('Github identifier: ' + eventDesc);
        log.info('---------------------------------');

        return this.handleTasks(this, this).then(() => {
            return this.addEventSummaryComment(this).then(event => {
                let url;
                if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
                    let baseUrl = process.env.GTM_BASE_URL || 'http://localhost:9091';
                    url = `${baseUrl}/metrics/log/gtm-${event.eventId}.txt`;
                }
                let status = event.failed ? 'failure' : 'success';
                let eventStatus = AgentUtils.createEventStatus(
                    this.eventData,
                    status,
                    'GitHub Task Manager',
                    `Completed ${event.eventId}`,
                    url
                );

                AgentUtils.postResultsAndTrigger(eventStatus, `Executing event: ${event.eventId}`);
                let endTime = new Date().getTime();
                let duration = endTime - startTime;
                log.info({
                    resultType: 'EVENT',
                    eventType: event.eventType,
                    repo: event.eventData.repository.full_name,
                    url: this.getEventUrl(),
                    duration: duration,
                    failed: event.failed || false
                });
            });
        });
    }

    /**
     * 1. set all event status to 'pending'
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

        let url;
        if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
            let baseUrl = process.env.GTM_BASE_URL || 'http://localhost:9091';
            url = `${baseUrl}/metrics/log/gtm-${event.eventId}.txt`;
        }

        let eventStatus = AgentUtils.createEventStatus(
            this.eventData,
            'pending',
            'GitHub Task Manager',
            `Executing ${event.eventId}`,
            url
        );

        promises.push(AgentUtils.postResultsAndTrigger(eventStatus, `Executing event: ${event.eventId}`, log));

        // Only send the welcome message if variable is not 'false'
        if (event.eventType === 'pull_request') {
            let showWelcomeMessage = process.env.GTM_WELCOME_MESSAGE_ENABLED !== 'false';

            if (event.taskConfig.pull_request.isDefaultConfig && showWelcomeMessage) {
                let warningPath =
                    process.env.GTM_TASK_CONFIG_DEFAULT_MESSAGE_PATH ||
                    __dirname + '/../handlers/PullRequestDefaultConfigWarning.md';

                let warning = fs.readFileSync(warningPath, 'utf-8');
                await this.addEventComment(event, warning, null);
            }
        }

        if (parent.tasks) {
            parent.tasks.forEach(async task => {
                if (task.disabled) {
                    log.warn(`skipping disabled task ${event.eventType} => ${task.executor}:${task.context}`);
                    return;
                }

                task.options = AgentUtils.applyTransforms(
                    AgentUtils.templateReplace(
                        await AgentUtils.createBasicTemplate(event.eventData, parent, log),
                        task.options,
                        log
                    )
                );

                let initialState = 'pending';
                let initialDesc = 'Task Execution in Progress';

                if (!Executor.isRegistered(task.executor)) {
                    initialState = 'error';
                    initialDesc = 'Unknown Executor: ' + task.executor;
                }

                if (!parent || !parent.hash) {
                    log.info('No Parent Hash Found. Creating Child Hash');
                    task.hash = AgentUtils.createMd5Hash(task);
                } else {
                    log.info('Parent Hash Found. Appending to Child Hash');
                    task.hash = AgentUtils.createMd5Hash(task, parent.hash);
                }

                let eventContext = `${task.executor}: ${task.context} (${task.hash})`;

                let status = AgentUtils.createEventStatus(
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
                let startTime = new Date().getTime();

                try {
                    taskPromise = executor
                        .executeTask(task)
                        .then(task => {
                            if (task.results === 'NO_MATCHING_TASK') {
                                status = AgentUtils.createEventStatus(
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
                                status = AgentUtils.createEventStatus(
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
                            this.handleTaskResult(event, task, log, startTime);

                            return AgentUtils.postResultsAndTrigger(
                                status,
                                `Task result '${status.state}' for ${event.eventType} => ${task.executor}:${
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

                            if (!task.results) {
                                task.results = {
                                    passed: false,
                                    url: 'https://github.com/zotoio/github-task-manager',
                                    message: e.message
                                };
                            }

                            status = AgentUtils.createEventStatus(
                                event.eventData,
                                'error',
                                eventContext,
                                'Task execution failure',
                                task.results.url
                            );

                            this.handleTaskResult(event, task, log, startTime);

                            return AgentUtils.postResultsAndTrigger(
                                status,
                                `Result 'error' for ${event.eventType} => ${task.executor}:${
                                    task.context
                                } - Event ID: ${event.eventId}`,
                                log
                            )
                                .then(() => {
                                    let taskMasked = _.cloneDeep(task);
                                    if (taskMasked.options && taskMasked.options.env) {
                                        Object.keys(taskMasked.options.env).forEach(key => {
                                            if (new RegExp('LOGIN|OAUTH|KEY|TOKEN|SECRET|PASSW|CLONE').test(key)) {
                                                taskMasked.options.env[key] = AgentUtils.maskString(
                                                    taskMasked.options.env[key]
                                                );
                                            }
                                        });
                                        taskMasked.options.env.GIT_CLONE = event.eventData.repository.clone_url;
                                    }

                                    let commentBody = `### Task failed during event ${event.eventId}\n'${
                                        task.executor
                                    }: ${
                                        task.context
                                    }', any subtasks have been skipped. Config: \n\`\`\`json\n${formatJson.plain(
                                        taskMasked
                                    )}\n\`\`\``;
                                    return this.addEventComment(event, commentBody, task);
                                })
                                .then(() => {
                                    return task;
                                });
                        });
                } catch (e) {
                    log.error(e);

                    this.handleTaskResult(event, task, log, startTime);

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

    handleTaskResult(event, task, log, startTime) {
        let endTime = new Date().getTime();
        let duration = endTime - startTime;
        if (!task.results.passed) event.failed = true;
        log.info({
            resultType: 'TASK',
            eventType: this.eventType,
            repo: event.eventData.repository.full_name,
            url: this.getEventUrl(),
            executor: task.executor,
            context: task.context,
            duration: duration,
            failed: !task.results.passed
        });
    }

    async addEventComment(event, commentBody, task) {
        let log = this.log;
        // don't add comment to PR if disabled for this event type, or disabled for current task
        if (!event.taskConfig[event.eventType].disableComments && (!task || !task.disableComments)) {
            if (commentBody === '') commentBody = 'no comment';
            log.info(`adding event comment: ${commentBody}`);

            let status = AgentUtils.createEventStatus(event.eventData, 'N/A', 'COMMENT_ONLY', commentBody);

            return AgentUtils.postResultsAndTrigger(
                status,
                `Result for ${event.eventType} => Event ID: ${event.eventId}<br/>`,
                log
            ).then(function() {
                log.info('event comment queued.');
                log.info('-----------------------------');
                return event;
            });
        } else {
            log.info(`skipping comment per .githubTaskManager.json`);
        }
    }

    async addEventSummaryComment(event) {
        let commentBody = `### Results for event id: ${event.eventId}\n`;
        event.tasks.forEach(task => {
            commentBody += `<details>${this.buildEventSummary(task, 0, '')}</details>`;
        });

        // if elk stack is configured, link to rehydrated logs
        if (process.env.GTM_ELASTIC_HOST && process.env.GTM_ELASTIC_PORT) {
            let baseUrl = process.env.GTM_BASE_URL || 'http://localhost:9091';
            commentBody += `<a href="${baseUrl}/metrics/log/gtm-${event.eventId}.txt">View full log</a>`;
        }
        return this.addEventComment(event, commentBody);
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
    buildEventSummary(task, depth, commentBody) {
        if (!task.disabled && task.results && task.results.message) {
            commentBody += `<summary>${task.executor} : ${task.context} (${task.hash}) ${
                task.results.message
            }</summary>\n`;
            commentBody += `<p>${task.results.details || ''}\n${task.results.url || ''}`;
            if (task.tasks) {
                commentBody += `<details>`;
                task.tasks.forEach(subtask => {
                    commentBody = this.buildEventSummary(subtask, depth++, commentBody);
                });
                commentBody += `</details>`;
            }
            commentBody += `</p>`;
        }
        return commentBody;
    }
}

requireDir('../handlers');

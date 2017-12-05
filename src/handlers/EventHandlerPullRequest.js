import { EventHandler } from '../agent/EventHandler';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class EventHandlerPullRequest extends EventHandler {

    handleEvent(eventData) {

        log.info('\n-----------------------------');
        log.info('New Event: ' + eventData.ghEventType);
        log.info('Repository Name: ' + eventData.repository.name);
        log.info('Pull Request: ' + eventData.pull_request.number);

        // first set each pr check to pending
        this.setIntialTaskState(eventData);

        // now process each task..
        this.processTasks(eventData);

    }

    setIntialTaskState(eventData) {

        eventData.ghTaskConfig.tasks.forEach(async (task) => {

            let initialState = 'pending';
            let initialDesc = 'Task Execution in Progress';
            if (!Executor.isRegistered(task.executor)) {
                initialState = 'error';
                initialDesc = 'Unknown Executor';
            }

            log.info('\n## Setting Task "' + task.type + '" to ' + initialState);
            log.info(task);

            let status = Utils.createStatus(
                eventData,
                initialState,
                task.type,
                initialDesc,
                'https://www.google.com' // fails if not an https url
            );

            await Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function () {
                log.info('-----------------------------');
            });
        });
    }

    processTasks(eventData) {

        //todo use q.all on promise array to trigger in parallel
        eventData.ghTaskConfig.tasks.forEach(async (task) => {

            if (!Executor.isRegistered(task.executor)) {
                return;
            }

            // todo params by executor type
            let executor = Executor.create(task.executor, {
                url: 'https://kuro.neko.ac',
                username: process.env.NEKO_USER,
                password: process.env.NEKO_PWD
            });

            // todo param merge taskConfig with agent conf?
            let buildResult = await executor.executeTask(task.executor, {
                TAGS: '["@sample-run"]',
                ENVIRONMENT: 'automated-test-env'
            });
            log.info('Build Result: ' + JSON.stringify(buildResult));

            let status = Utils.createStatus(
                eventData,
                buildResult.passed ? 'success' : 'error',
                task.type,
                buildResult.passed ? 'Task Completed Successfully' : 'Task Completed with Errors',
                buildResult.url
            );

            await Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function () {
                log.info('-----------------------------');
            });

        });

    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);
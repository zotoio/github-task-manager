import { EventHandler } from '../lib/EventHandler';
import { Utils } from '../lib/utils';
import { CIExecutor } from '../lib/CIExecutor';

export class EventHandlerPullRequest extends EventHandler {

    handleEvent(eventData) {

        console.log('\n-----------------------------');
        console.log('New Event: ' + eventData.ghEventType);
        console.log('Repository Name: ' + eventData.repository.name);
        console.log('Pull Request: ' + eventData.pull_request.number);

        // first set each pr check to pending
        setIntialTaskState(eventData);

        // now process each task..
        processTasks(eventData);

    }

    setIntialTaskState(eventData) {

        eventData.ghTaskConfig.tasks.forEach(async (task) => {

            let initialState = 'pending';
            let initialDesc = 'Task Execution in Progress';
            if (!CIExecutor.isRegistered(task.executor)) {
                initialState = 'error';
                initialDesc = 'Unknown Executor';
            }

            console.log('\n## Setting Task "' + task.type + '" to ' + initialState);
            console.log(task);

            let status = Util.createStatus(
                eventData,
                initialState,
                task.type,
                initialDesc,
                '#'
            );

            await Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function () {
                console.log('-----------------------------');
            });
        });
    }

    processTasks(eventData) {

        //todo use q.all on promise array to trigger in parallel
        eventData.ghTaskConfig.tasks.forEach(async (task) => {

            if (!CIExecutor.isRegistered(task.executor)) {
                return;
            }

            // todo params by executor type
            let executor = CIExecutor.create(task.executor, {
                url: 'https://kuro.neko.ac',
                username: process.env.NEKO_USER,
                password: process.env.NEKO_PWD
            });

            // todo param merge taskConfig with agent conf?
            let buildResult = await executor.executeTask(task.executor, {
                TAGS: '["@sample-run"]',
                ENVIRONMENT: 'automated-test-env'
            });
            console.log('Build Result: ' + JSON.stringify(buildResult));

            let status = Util.createStatus(
                eventData,
                buildResult.passed ? 'success' : 'error',
                task.type,
                buildResult.passed ? 'Task Completed Successfully' : 'Task Completed with Errors',
                buildResult.url
            );

            await Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function () {
                console.log('-----------------------------');
            });

        });

    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);
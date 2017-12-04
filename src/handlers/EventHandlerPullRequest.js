import { HandlerStore } from '../lib/HandlerStore';
import { EventHandler } from '../lib/EventHandler';
import { Utils } from '../lib/utils';
import { CIExecutor } from '../lib/CIExecutor';

HandlerStore.addHandler(new EventHandler('pull_request', function(eventData) {
    console.log('\n-----------------------------');
    console.log('New Event: ' + eventData.ghEventType);
    console.log('Repository Name: ' + eventData.repository.name);
    console.log('Pull Request: ' + eventData.pull_request.number);

    // first set each pr check to pending
    setIntialTaskState(eventData);

    // now process each task..
    processTasks(eventData);

}));

function setIntialTaskState(eventData) {

    eventData.ghTaskConfig.tasks.forEach(async (task)=> {

        let initialState = 'pending';
        let initialDesc = 'tasks are executing..';
        if (!CIExecutor.isRegistered(task.executor)) {
            initialState = 'error';
            initialDesc = 'unknown executor!';
        }

        console.log('\n## setting task "' + task.type + '" to ' + initialState);
        console.log(task);

        let status = createStatus(
            eventData,
            initialState,
            task.type,
            initialDesc
        );

        await Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function () {
            console.log('-----------------------------');
        });
    });
}

function processTasks(eventData) {

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
        console.log('Build Result: ' + buildResult);

        let status = createStatus(
            eventData,
            buildResult ? 'success' : 'error',
            task.type,
            buildResult ? 'Task completed successfully' : 'Task completed with errors'
        );

        await Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function () {
            console.log('-----------------------------');
        });

    });

}

function createStatus(eventData, state, context, description) {
    return {
        owner: eventData.repository.owner.login ? eventData.repository.owner.login : 'Default_Owner',
        repo: eventData.repository.name ? eventData.repository.name : 'Default_Repository',
        sha: eventData.pull_request.head.sha ? eventData.pull_request.head.sha : 'Missing SHA',
        state: state,
        target_url: 'http://neko.ac', //todo
        description: description,
        context: context
    };
}

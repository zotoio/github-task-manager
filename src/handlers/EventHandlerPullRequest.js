import { HandlerStore } from '../lib/HandlerStore';
import { EventHandler } from '../lib/EventHandler';
import { Utils } from '../lib/utils';

HandlerStore.addHandler(new EventHandler('pull_request', function(eventData) {
    console.log('-----------------------------');
    console.log('New Event: ' + eventData.ghEventType);
    console.log('Repository Name: ' + eventData.repository.name);
    console.log('Pull Request: ' + eventData.pull_request.number);
    let status = {
        owner: eventData.repository.owner.login ? eventData.repository.owner.login : 'Default_Owner',
        repo: eventData.repository.name ? eventData.repository.name : 'Default_Repository',
        sha: eventData.pull_request.head.sha ? eventData.pull_request.head.sha : 'Missing SHA',
        state: 'success',
        target_url: 'http://neko.ac',
        description: 'Tests from Orchestrator Passed',
        context: 'Functional-Tests'
    };
    Utils.postResultsAndTrigger(process.env.GTM_SQS_RESULTS_QUEUE, status, process.env.GTM_SNS_RESULTS_TOPIC, 'Ping').then(function() {
        console.log('-----------------------------');
    });
}));
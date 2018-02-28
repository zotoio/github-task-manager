import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { EventHandler } from '../../src/agent/EventHandler';
import { EventHandlerPullRequest } from '../../src/handlers/EventHandlerPullRequest';

describe('EventHandlerPullRequest', function() {
    let handlerPullRequest;
    let eventData;

    beforeEach(() => {
        eventData = {
            ghEventId: 'id',
            ghEventType: 'pull_request',
            ghTaskConfig: {},
            MessageHandle: 'handle'
        };

        handlerPullRequest = new EventHandlerPullRequest(eventData, console);
    });

    describe('constructor', function() {
        it('should instantiate as EventHandler', function() {
            assert.equal(handlerPullRequest instanceof EventHandler, true);
        });
    });
});

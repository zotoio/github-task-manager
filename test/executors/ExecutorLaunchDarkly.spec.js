import { default as sinon } from 'sinon';
import { before, after, describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorLaunchDarkly } from '../../src/executors/ExecutorLaunchDarkly';

describe('ExecutorLaunchDarkly', () => {
    let executorLaunchDarkly;
    let eventData;

    beforeEach(() => {
        eventData = {
            executor: 'LaunchDarkly',
            context: 'toggle features',
            options: {
                project: 'myProject',
                environment: 'dev',
                flags: {
                    'test-one': true,
                    'test-two': false
                }
            }
        };
        executorLaunchDarkly = new ExecutorLaunchDarkly(eventData);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorLaunchDarkly instanceof Executor, true);
        });
    });

    describe('getLDUtils', () => {
        it('should return a promise', async () => {
            let ldUtils = executorLaunchDarkly.getLDUtils();
            assert.equal(ldUtils instanceof Promise, true);
        });
    });

    describe('executeTask', () => {
        let stubCall;
        let customResult;
        before(function() {
            customResult = {
                passed: true,
                url: 'https://launchdarkly.com'
            };
            stubCall = sinon.stub(executorLaunchDarkly, 'executeTask').returns(Promise.resolve(customResult));
        });

        it('should invoke mocked ExecuteLaunchDarkly.executeTask', async () => {
            let result = await stubCall(eventData).then(data => {
                return data;
            });
            assert.equal(result, customResult);
        });

        after(() => {
            stubCall.restore();
        });
    });
});

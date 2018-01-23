import { default as sinon } from 'sinon';
import { before, after, describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorDocker } from '../../src/executors/ExecutorDocker';

describe('ExecutorDocker', () => {
    let executorDocker;
    let eventData;

    beforeEach(() => {
        eventData = {
            executor: 'Docker',
            context: 'run ls in latest alpine',
            options: {
                image: 'alpine:latest',
                command: ['/bin/ls', '-ltr', '/bin']
            }
        };
        executorDocker = new ExecutorDocker(eventData);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorDocker instanceof Executor, true);
        });
    });

    describe('run', () => {
        it('should return all the tied runFunctions', () => {
            assert.notEqual(executorDocker.run('push'), null);
        });
    });

    describe('executeTask', () => {
        let stubCall;
        let customResult;
        before(function() {
            customResult = {
                passed: true,
                url: 'https://docker.com'
            };
            stubCall = sinon.stub(executorDocker, 'executeTask').returns(Promise.resolve(customResult));
        });

        it('should invoke mocked ExecuteDocker.executeTask', async () => {
            let result = await stubCall(eventData).then(data => {
                return data;
            });
            assert.equal(result, customResult);
        });

        after(() => {
            stubCall.restore();
        });

        /*TO WORK AROUND - the uncaughtException and then uncomment this test
        it('should throw exception due to invalid environment', async done => {
            var error = new Error('Exception while executing the function executorDocker.executeTask');
            var recordedError;
            var originalException = process.listeners('uncaughtException').pop();
            //Needed in node 0.10.5+
            process.removeListener('uncaughtException', originalException);
            process.once('uncaughtException', function(error) {
                recordedError = error;
            });

            let result = await TestUtils.assertThrowsAsynchronously(
                async () => await executorDocker.executeTask(eventData),
                'executorDocker.executeTask'
            ).then(data => {
                done();
                return data;
            });
            console.log(result);
            process.nextTick(function() {
                process.listeners('uncaughtException').push(originalException);
                assert.equal(recordedError, error);
                done();
                //next();
            });
        });
        */
    });
});

import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorPing } from '../../src/executors/ExecutorPing';

describe('ExecutorPing', () => {
    let executorPing;
    let eventData;

    beforeEach(() => {
        process.env.GTM_SQS_RESULTS_QUEUE = 'gtmResultsQueue';
        process.env.GTM_SNS_RESULTS_TOPIC = 'gtmResultsSNSTopic';
        process.env.GTM_AWS_REGION = 'ap-southeast-2a';
        eventData = {
            executor: 'Ping',
            context: 'diagnostic',
            options: {
                count: 1
            },
            repository: {
                name: 'pingTest',
                owner: {
                    login: 'shell_cli'
                }
            },
            pull_request: {
                head: {
                    sha: 'cee03d54dc35650b903b0cdc38ebd49208b1efa4'
                }
            }
        };
        executorPing = new ExecutorPing(eventData, console);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorPing instanceof Executor, true);
        });
    });

    describe('executeTask', () => {
        it('should call ExecutorPing.executeTask with 1 event', async () => {
            try {
                await executorPing.executeTask(eventData).then(data => {
                    return data;
                });
            } catch (e) {
                return assert.equal(e.message, 'Missing region in config');
            }
        });
    });
});

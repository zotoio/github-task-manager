import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorHttp } from '../../src/executors/ExecutorHttp';

describe('ExecutorHttp', () => {
    let executorHttp;
    let eventData;

    beforeEach(() => {
        eventData = {
            executor: 'Http',
            context: 'avtest',
            options: {
                har: {
                    url: 'https://httpbin.org/headers',
                    method: 'GET',
                    headers: [
                        {
                            name: 'accept',
                            value: 'application/json'
                        }
                    ]
                },
                validator: {
                    type: 'bodyJson',
                    objectCheckRef: 'headers.Host',
                    objectCheckVal: 'httpbin.org'
                }
            }
        };

        executorHttp = new ExecutorHttp(eventData);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorHttp instanceof Executor, true);
        });
    });

    describe('executeTask', () => {
        it('should call ExecutorHttp.executeTask', async () => {
            let result;
            result = await executorHttp.executeTask(eventData).then(data => {
                return data;
            });
            assert.equal(result.results.passed, true);
        });
    });
});

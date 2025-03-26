import { describe, it, beforeEach, before, after } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorHttp } from '../../src/executors/ExecutorHttp';
import { default as fs } from 'fs';
import { default as sinon } from 'sinon';

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
                            value: 'application/json',
                        },
                    ],
                },
                validator: {
                    type: 'bodyJson',
                    objectCheckRef: 'headers.Host',
                    objectCheckVal: 'httpbin.org',
                },
            },
        };

        executorHttp = new ExecutorHttp(eventData, console);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorHttp instanceof Executor, true);
        });
    });

    describe('executeTask', () => {
        let stubCall;
        let customResult;
        before(function () {
            customResult = fs.readFileSync(__dirname + '/../fixtures/executorHttpResponse.json', 'utf-8');
            stubCall = sinon
                .stub(ExecutorHttp.prototype, 'sendRequest')
                .returns(Promise.resolve({ body: customResult }));
        });
        it('should call ExecutorHttp.executeTask', async () => {
            let result;
            result = await executorHttp.executeTask(eventData).then((data) => {
                return data;
            });
            assert.equal(result.results.passed, true);
        });
        after(() => {
            stubCall.restore();
        });
    });

    describe('validate', () => {
        it('should validate for bodyJson', () => {
            let actual = executorHttp.validate(eventData, { body: '{"headers": {"Host": "httpbin.org"}}' });
            let expected = true;
            assert.equal(actual, expected);
        });
    });
});

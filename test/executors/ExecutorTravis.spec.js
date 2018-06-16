import { default as fs } from 'fs';
import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorTravis } from '../../src/executors/ExecutorTravis';

describe('ExecutorTravis', function() {
    let executorTravis;
    let eventData;

    beforeEach(() => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8'));
        executorTravis = new ExecutorTravis(eventData, console);
    });

    describe('constructor', function() {
        it('should instantiate as Executor', function() {
            assert.equal(executorTravis instanceof Executor, true);
        });
    });

    /*describe('executeTask', () => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8'));
        let expectedObject = { passed: true, url: 'https://travis-ci.org' };
        it('executeTask to return result object', async () => {
            let result = await executorTravis.executeTask(eventData.ghTaskConfig.tasks);
            for (let i = 0; i < 2; i++) {
                assert.equal(result[i], expectedObject[i]);
            }
        });
    });*/
});

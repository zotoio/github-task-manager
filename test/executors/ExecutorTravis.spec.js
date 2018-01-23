import { default as fs } from 'fs';
import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorTravis } from '../../src/executors/ExecutorTravis';

describe('ExecutorTravis', function() {
    let executorTravis;
    let eventData;
    process.env.GTM_JENKINS_USER = 'ciuser';
    process.env.GTM_JENKINS_URL = 'http://localhost:8211';

    beforeEach(() => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8'));
        executorTravis = new ExecutorTravis(eventData);
    });

    describe('constructor', function() {
        it('should instantiate as Executor', function() {
            assert.equal(executorTravis instanceof Executor, true);
        });
    });

    describe('run', () => {
        it('should return all the tied runFunctions', () => {
            assert.notEqual(executorTravis.run('pull_request'), null);
        });
    });

    describe('executeTask', () => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8'));
        let expectedObject = { passed: true, url: 'https://travis-ci.org' };
        it('executeTask to return result object', async () => {
            let result = await executorTravis.executeTask(eventData.ghTaskConfig.task);
            for (let i = 1; i < 5; i++) {
                assert.equal(result[i], expectedObject[i]);
            }
        });
    });
});

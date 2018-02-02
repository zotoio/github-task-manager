import { default as fs } from 'fs';
import { default as sinon } from 'sinon';
import { before, after, describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorJenkins } from '../../src/executors/ExecutorJenkins';

describe('ExecutorJenkins', function() {
    let executorJenkins;
    let eventData;
    process.env.GTM_JENKINS_USER = 'ciuser';
    process.env.GTM_JENKINS_URL = 'http://localhost:8211';
    let NON_EXISTING_JENKINS_SERVER = ': connect ECONNREFUSED 127.0.0.1:8211';

    beforeEach(() => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8'));
        executorJenkins = new ExecutorJenkins(eventData);
    });

    describe('constructor', function() {
        it('should instantiate as Executor', function() {
            assert.equal(executorJenkins instanceof Executor, true);
        });
    });

    describe('executeTask', () => {
        let stubCall;
        let customResult;
        before(function() {
            customResult = { content: 'counterfeit task executed' };
            stubCall = sinon.stub(executorJenkins, 'executeTask').returns(Promise.resolve(customResult));
        });

        it('should return the run result object', async () => {
            let result = await stubCall(eventData.ghTaskConfig.task);
            assert.equal(result, customResult);
        });

        after(function() {
            stubCall.restore();
        });

        it('should return an object for misconfigured builds', async () => {
            let sampleTask = {};
            sampleTask.executor = 'Jenkins';
            sampleTask.options = {
                jobName: 'Test Job'
            };
            try {
                let result = await executorJenkins.executeTask(sampleTask);
                assert.equal(result.results.message, 'Required Parameters not Specified for Test Job');
            } catch (result) {
                assert.equal(result.results.message, 'Required Parameters not Specified for Test Job');
            }
        });

        it('executeTask to return result object', async () => {
            eventData = JSON.parse(
                fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8')
            );
            try {
                await executorJenkins.executeTask(eventData.ghTaskConfig.tasks).then(data => {
                    return data;
                });
            } catch (e) {
                return assert.equal(e.message, `jenkins: job.build${NON_EXISTING_JENKINS_SERVER}`);
            }
        });
    });

    describe('waitForBuild', () => {
        let customResult = {};
        customResult.state = 'finished';
        let buildNumber = 12;
        let buildName = 'projectName';
        let stubCall;
        before(() => {
            stubCall = sinon.stub(executorJenkins, 'waitForBuild').returns(Promise.resolve(customResult));
        });

        it('should wait for build to complete(mocked)', async () => {
            let result = await stubCall(buildName, buildNumber);
            assert.equal(result, customResult);
        });

        after(() => {
            stubCall.restore();
        });

        it('should throw error while waiting for non-existing build', async () => {
            try {
                await executorJenkins.waitForBuild(buildName, buildNumber).then(data => {
                    return data;
                });
            } catch (e) {
                return assert.equal(e.message, `jenkins: build.get${NON_EXISTING_JENKINS_SERVER}`);
            }
        });
    });

    describe('waitForBuildToExist', () => {
        let customResult = true;

        let stubCall;
        before(() => {
            stubCall = sinon.stub(executorJenkins, 'waitForBuildToExist').returns(Promise.resolve(customResult));
        });

        it('should wait for the build to complete', async () => {
            let buildNumber = 12;
            let buildName = 'projectName';
            let result = await stubCall(buildName, buildNumber);
            assert.equal(result, customResult);
        });

        after(() => {
            stubCall.restore();
        });
    });

    describe('buildNumberfromQueue', () => {
        it('should return build number from queue', async () => {
            try {
                let result = await executorJenkins.buildNumberfromQueue(12);
                console.log(result);
            } catch (e) {
                return assert.equal(e.message, `jenkins: queue.item${NON_EXISTING_JENKINS_SERVER}`);
            }
        });
    });
});

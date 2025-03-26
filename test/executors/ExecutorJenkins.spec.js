import { default as fs } from 'fs';
import { default as sinon } from 'sinon';
import { before, after, describe, it, beforeEach, afterEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorJenkins } from '../../src/executors/ExecutorJenkins';
import JenkinsMock from '../mocks/jenkins-mock';

describe('ExecutorJenkins', function () {
    let executorJenkins;
    let eventData;
    let jenkinsMock;
    process.env.GTM_JENKINS_USER = 'ciuser';
    process.env.GTM_JENKINS_URL = 'http://localhost:8211';

    beforeEach(async () => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorJenkinsTaskPayload.json', 'utf-8'));
        executorJenkins = new ExecutorJenkins(eventData, console);
        await executorJenkins.initJenkins();
        jenkinsMock = new JenkinsMock();
        jenkinsMock.start();
    });

    afterEach(() => {
        jenkinsMock.stop();
    });

    describe('constructor', function () {
        it('should instantiate as Executor', function () {
            assert.equal(executorJenkins instanceof Executor, true);
        });
    });

    describe('executeTask', () => {
        let stubCall;
        let customResult;
        before(function () {
            customResult = { content: 'counterfeit task executed' };
            stubCall = sinon.stub(executorJenkins, 'executeTask').returns(Promise.resolve(customResult));
        });

        it('should return the run result object', async () => {
            let result = await stubCall(eventData.ghTaskConfig.task);
            assert.equal(result, customResult);
        });

        after(function () {
            stubCall.restore();
        });

        it('executeTask to return result object', async function() {
            this.timeout(10000); // Increase timeout to 10s
            const task = {
                options: {
                    jobName: 'test-job',
                    parameters: {
                        param1: 'value1',
                    },
                },
            };
            let result = await executorJenkins.executeTask(task);
            assert.equal(result.results.passed, true);
            assert.equal(result.results.url, 'http://localhost:8211/job/test/1');
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

        it('should wait for build to complete', async () => {
            await executorJenkins.initJenkins();
            let result = await executorJenkins.waitForBuild('test', 1);
            assert.equal(result.result, 'SUCCESS');
            assert.equal(result.url, 'http://localhost:8211/job/test/1');
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
                // Pass queue ID as number
                let result = await executorJenkins.buildNumberfromQueue(12);
                assert.equal(result, 1); // Mock returns build number 1
            } catch (e) {
                assert.fail('Should not have thrown an error with mock server');
            }
        });
    });
});

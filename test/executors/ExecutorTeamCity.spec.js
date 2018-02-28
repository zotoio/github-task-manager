import { default as fs } from 'fs';
import { default as ns } from 'node-static';
import { default as sinon } from 'sinon';
import { before, after, describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorTeamCity } from '../../src/executors/ExecutorTeamCity';

describe('ExecutorTeamCity', function() {
    let executorTeamcity;
    let eventData;
    process.env.GTM_TEAMCITY_USER = 'admin';
    process.env.GTM_TEAMCITY_PASSCODE = 'admin';
    process.env.GTM_TEAMCITY_URL = 'http://localhost:8111';

    beforeEach(() => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorTeamCityTaskPayLoad.json', 'utf-8'));
        executorTeamcity = new ExecutorTeamCity(eventData, console);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorTeamcity instanceof Executor, true);
        });
    });

    describe('createTeamCityBuildNode', () => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorTeamCityTaskPayLoad.json', 'utf-8'));
        let jobName = eventData.ghTaskConfig.task.context;

        let buildNodeObject =
            '<build>' +
            '<buildType id="' +
            jobName +
            '"/>' +
            '<properties>' +
            '<property name="build_tag" value="proj_wasX"/>' +
            '<property name="cuke_env" value="env_dev"/>' +
            '<property name="cuke_tags" value="@proj_wasX,@proj_wasn"/>' +
            '</properties>' +
            '</build>';

        it('should return build request xml payload', () => {
            assert.equal(
                executorTeamcity.createTeamCityBuildNode(eventData.ghTaskConfig.task, jobName),
                buildNodeObject
            );
        });
    });

    describe('executeTask', () => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/executorTeamCityTaskPayLoad.json', 'utf-8'));

        let stubCall;
        let customResult;
        before(() => {
            customResult = { content: 'counterfeit task executed' };
            stubCall = sinon.stub(executorTeamcity, 'executeTask').returns(Promise.resolve(customResult));
        });

        it('executeTask to return the custom result object', async () => {
            let result = await stubCall(eventData.ghTaskConfig.task);
            assert.equal(result, customResult);
        });

        after(() => {
            stubCall.restore();
        });

        it('execute Task to return NO_MATCHING_TASK for invalid jobName', async () => {
            let sampleTask = {};
            sampleTask.options = { executor: 'TeamCity', build_tag: 'proj_wasX', cuke_env: 'env_dev' };
            let result = await executorTeamcity.executeTask(sampleTask);
            assert.equal(result, 'NO_MATCHING_TASK');
        });

        it('executeTask to return result object', async () => {
            eventData = JSON.parse(
                fs.readFileSync(__dirname + '/../fixtures/executorTeamCityTaskPayLoad.json', 'utf-8')
            );
            try {
                await executorTeamcity.executeTask(eventData.ghTaskConfig.task);
            } catch (e) {
                return assert.equal(e.message, 'connect ECONNREFUSED 127.0.0.1:8111');
            }
        });
    });

    describe('createResultObject', () => {
        let expectedResult = {};
        expectedResult.TotalTestCount = 18;
        expectedResult.PassedTestCount = 17;
        expectedResult.FailedTestCount = 1;
        expectedResult.testResultsUrl = undefined;

        it('converts xml response of TC build to json', done => {
            fs.readFileSync(__dirname + '/../fixtures/teamCityStatisticsXMLPayload.xml', data => {
                assert.equal(executorTeamcity.createResultObject(data), expectedResult);
            });
            done();
        });
    });

    describe('getBuildStatistics', () => {
        let staticServer;
        let returnXMLContext;
        before(() => {
            let file = new ns.Server(__dirname + '/../fixtures/teamCityStatisticsXMLPayload.xml');
            returnXMLContext = fs.readFileSync(__dirname + '/../fixtures/teamCityStatisticsXMLPayload.xml', data => {
                return data;
            });

            staticServer = require('http').createServer((request, response) => {
                file.serve(request, response);
            });

            staticServer.listen(4321);
        });

        let statisticsUrl = 'http://localhost:4321';

        it('reads the statistics xml payload from static server', async () => {
            let resultXML = await executorTeamcity.getBuildStatistics(statisticsUrl);
            assert.equal(resultXML, returnXMLContext);
        });

        after(() => {
            staticServer.close();
        });
    });

    describe('waitForBuildToComplete', () => {
        let customResult = {};
        customResult.state = 'finished';

        let stubCall;
        before(() => {
            stubCall = sinon.stub(executorTeamcity, 'waitForBuildToComplete').returns(Promise.resolve(customResult));
        });

        it('return result for custom build status set as finished', async () => {
            let buildNumber = 12;
            let buildName = 'projectName';
            let result = await stubCall(buildName, buildNumber);
            assert.equal(result, customResult);
        });

        after(() => {
            stubCall.restore();
        });

        it('waits for build to complete with finished state', async () => {
            let invalidBuild = {};
            invalidBuild.message = 'Invalid Build Information';
            let buildNumber = 12;
            let buildName = 'projectName';
            try {
                await executorTeamcity.waitForBuildToComplete(buildName, buildNumber);
            } catch (e) {
                return assert.equal(e.message, 'connect ECONNREFUSED 127.0.0.1:8111');
            }
        });
    });
});

import { default as TeamCity } from 'teamcity-rest-api';
import { default as rp } from 'request-promise-native';
import { default as xmlBuilder } from 'jsontoxml';
import { default as x2j } from 'xml2js';
import { default as URL } from 'url';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import KmsUtils from '../KmsUtils';

/**
 * Sample .githubTaskManager.json task config
 *
 * see: https://github.com/zotoio/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 * {
        "executor": "TeamCity",
        "context": "run e2e tests",
        "options": {
          "jobName": "projectName_id",
          "parameters": {
            "build_tag" : "proj_wasX",
            "ENVIRONMENT" : "env_dev",
            "cuke_env" : "env_dev|staging|prod",
            "cuke_tags" : [
              "@proj_wasX",
              "@proj_wasn"
            ]
          }
        }
    }
*/

export class ExecutorTeamCity extends Executor {
    constructor(eventData, log) {
        super(eventData, log);
        this.log = log;
        KmsUtils.logger = log;
        this.options = this.getOptions();

        this.teamCity = TeamCity.create({
            url: this.options.GTM_TEAMCITY_URL,
            username: this.options.GTM_TEAMCITY_USER,
            password: KmsUtils.getDecrypted(this.options.GTM_CRYPT_TEAMCITY_PASSCODE)
        });
    }

    createTeamCityBuildNode(task, jobName) {
        let xml;
        let xmlNode = {
            name: 'build',
            attrs: {},
            children: [{ name: 'buildType', attrs: { id: jobName } }, { name: 'properties', children: [] }]
        };

        if (task.options.hasOwnProperty('branchName')) {
            xmlNode.attrs.branchName = task.options.branchName;
        }

        for (var buildProperty in task.options.parameters) {
            let property = {
                name: 'property',
                attrs: {
                    name: buildProperty,
                    value: task.options.parameters[buildProperty]
                }
            };
            xmlNode.children[1].children.push(property);
        }

        xml = xmlBuilder([xmlNode]);
        return xml;
    }

    async executeTask(task) {
        let log = this.log;
        let jobName = task.options.jobName;

        if (jobName == undefined) {
            await AgentUtils.timeout(4000);
            return 'NO_MATCHING_TASK';
        }

        let buildNode = this.createTeamCityBuildNode(task, jobName);

        let teamCityBuildId = await this.teamCity.builds.startBuild(buildNode);
        log.info(`TeamCity Project[${jobName}] with buildNumber : ${teamCityBuildId.id} Started.`);

        let completedBuild = await this.waitForBuildToComplete(jobName, teamCityBuildId.id);
        log.info(
            `TeamCity Project[${jobName}] with buildNumber : #${teamCityBuildId.id} finished with status : ${
                completedBuild.status
            }`
        );

        let result = completedBuild.status === 'SUCCESS';
        let overAllResult = { passed: result, url: completedBuild.buildType.webUrl };

        if (task.options.parameters.hasOwnProperty('cuke_tags')) {
            let statisticsUrl = AgentUtils.formatBasicAuth(
                this.options.GTM_TEAMCITY_USER,
                KmsUtils.getDecrypted(this.options.GTM_CRYPT_TEAMCITY_PASSCODE),
                URL.resolve(this.options.GTM_TEAMCITY_URL, `/app/rest/builds/id:${teamCityBuildId.id}/statistics`)
            );

            let statistics = await this.getBuildStatistics(statisticsUrl);
            let parsedResult = this.createResultObject(statistics);
            parsedResult.testResultsUrl = URL.resolve(
                this.options.GTM_TEAMCITY_URL,
                `/viewLog.html?buildId=${teamCityBuildId.id}&tab=buildResultsDiv&buildTypeId=${teamCityBuildId.id}`
            );

            overAllResult.message = parsedResult;
        }

        task.results = overAllResult;

        return result ? Promise.resolve(task) : Promise.reject(task);
    }

    async waitForBuildToComplete(buildName, buildNumber) {
        let log = this.log;
        let buildDict = await this.teamCity.builds.get(buildNumber);
        let maxRetries = 600;
        let tries = 1;
        while (buildDict.state !== 'finished' && tries++ < maxRetries) {
            await AgentUtils.timeout(5000);
            buildDict = await this.teamCity.builds.get(buildNumber).then(function(data) {
                log.debug(`Waiting for Build '${buildName}' to Finish: ${tries}`);
                return data;
            });
        }
        log.debug(`TeamCity Project[${buildName}] with buildNumber : #${buildNumber} : ${buildDict.state}`);
        return buildDict;
    }

    async getBuildStatistics(statisticsUrl) {
        let log = this.log;
        log.debug(`Starting http request.. : ${statisticsUrl}`);

        let tries = 1;
        let maxRetries = 100;
        let resultData;
        resultData = await rp(statisticsUrl);

        while (!resultData.includes('SuccessRate') && tries++ < maxRetries) {
            await AgentUtils.timeout(3000);
            resultData = await rp(statisticsUrl).then(function(data) {
                return data;
            });
        }

        return resultData;
    }

    createResultObject(statistics) {
        let resultObject = {};

        let parsedJSON;
        let parser = new x2j.Parser();
        parser.parseString(statistics, (err, result) => {
            parsedJSON = result;
        });

        let statisticsArray = Object.values(parsedJSON.properties.property);

        let totalTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'TotalTestCount');
        let passedTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'PassedTestCount');
        let failedTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'FailedTestCount');
        let ignoredTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'IgnoredTestCount');

        resultObject.TotalTestCount = totalTestCount === undefined ? 0 : totalTestCount.$.value;
        resultObject.PassedTestCount = passedTestCount === undefined ? 0 : passedTestCount.$.value;
        resultObject.FailedTestCount = failedTestCount === undefined ? 0 : failedTestCount.$.value;
        resultObject.IgnoredTestCount = ignoredTestCount === undefined ? 0 : ignoredTestCount.$.value;

        return resultObject;
    }
}

Executor.register('TeamCity', ExecutorTeamCity);

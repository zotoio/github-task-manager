import { default as TeamCity } from 'teamcity-rest-api';
import { default as rp } from 'request-promise-native';
import { default as xmlBuilder } from 'jsontoxml';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
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
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.teamCity = TeamCity.create({
            url: this.options.GTM_TEAMCITY_URL,
            username: this.options.GTM_TEAMCITY_USER,
            password: this.options.GTM_TEAMCITY_PASSCODE
        });
    }

    createTeamCityBuildNode(task, jobName) {
        let xml;
        let xmlNode = {
            build: [{ name: 'buildType', attrs: { id: jobName } }, { name: 'properties', children: [] }]
        };

        for (var buildProperty in task.options.parameters) {
            let property = {
                name: 'property',
                attrs: {
                    name: buildProperty,
                    value: task.options.parameters[buildProperty]
                }
            };
            xmlNode.build[1].children.push(property);
        }

        xml = xmlBuilder(xmlNode);
        return xml;
    }

    async executeTask(task) {
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
                this.options.GTM_TEAMCITY_PASSCODE,
                `${this.options.GTM_TEAMCITY_URL}/app/rest/builds/id:${teamCityBuildId.id}/statistics`
            );

            let statistics = await this.getBuildStatistics(statisticsUrl);
            let parsedResult = this.createResultObject(statistics);
            parsedResult.testResultsUrl = `${this.options.GTM_TEAMCITY_URL}/viewLog.html?buildId=${
                teamCityBuildId.id
            }&tab=buildResultsDiv&buildTypeId=${teamCityBuildId.id}`;

            overAllResult.message = parsedResult;
        }

        return overAllResult;
    }

    async waitForBuildToComplete(buildName, buildNumber) {
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

        let parsedJSON = AgentUtils.xmlToJson(statistics);

        let statisticsArray = Object.values(parsedJSON.properties.property);

        let totalTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'TotalTestCount');
        let passedTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'PassedTestCount');
        let failedTestCount = AgentUtils.findMatchingElementInArray(statisticsArray, 'FailedTestCount');

        resultObject.TotalTestCount = totalTestCount === undefined ? 0 : totalTestCount.$.value;
        resultObject.PassedTestCount = passedTestCount === undefined ? 0 : passedTestCount.$.value;
        resultObject.FailedTestCount = failedTestCount === undefined ? 0 : failedTestCount.$.value;

        return resultObject;
    }
}

Executor.register('TeamCity', ExecutorTeamCity);

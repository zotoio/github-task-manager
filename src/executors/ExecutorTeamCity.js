import { default as TeamCity } from 'teamcity-rest-api';
import { default as x2j } from 'xml2js';
import { default as rp } from 'request-promise-native';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
 * {
        "executor": "TeamCity",
        "context": "projectName",
        "options": {
          "build_tag" : "proj_wasX",
          "build_env" : "env_dev",
          "cuke_env" : "env_dev|staging|prod",
          "cuke_tags" : [
            "@proj_wasX",
            "@proj_wasn"
          ]
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
        var buildProperties = '';
        for (var buildProperty in task.options) {
            buildProperties =
                buildProperties +
                '<property name="' +
                buildProperty +
                '" value="' +
                task.options[buildProperty] +
                '"/>\n';
        }

        let buildNodeObject =
            '<build>\n' +
            '<buildType id="' +
            jobName +
            '" />\n' +
            '<properties>\n' +
            buildProperties +
            '</properties>\n' +
            '</build>';

        return buildNodeObject;
    }

    async executeTask(task) {
        let jobName = task.context;

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

        let result = completedBuild.status === 'SUCCESS';
        return { passed: result, url: completedBuild.buildType.webUrl, message: parsedResult };
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

        if (resultData !== null) {
            return resultData;
        }
    }

    createResultObject(statistics) {
        let resultObject = {};
        let parser = new x2j.Parser();

        let parsedJSON;
        parser.parseString(statistics, function(err, result) {
            parsedJSON = result;
        });

        let totalTestCount,
            passedTestCount,
            failedTestCount,
            count = 0;

        while (count++ < Object.keys(parsedJSON.properties.property).length - 1) {
            totalTestCount =
                parsedJSON.properties.property[count].$.name === 'TotalTestCount'
                    ? parsedJSON.properties.property[count].$.value
                    : totalTestCount;
            passedTestCount =
                parsedJSON.properties.property[count].$.name === 'PassedTestCount'
                    ? parsedJSON.properties.property[count].$.value
                    : passedTestCount;
            failedTestCount =
                parsedJSON.properties.property[count].$.name === 'FailedTestCount'
                    ? parsedJSON.properties.property[count].$.value
                    : failedTestCount;
        }

        resultObject.TotalTestCount = totalTestCount !== undefined ? totalTestCount : 0;
        resultObject.PassedTestCount = passedTestCount !== undefined ? passedTestCount : 0;
        resultObject.FailedTestCount = failedTestCount !== undefined ? failedTestCount : 0;

        return resultObject;
    }
}

Executor.register('TeamCity', ExecutorTeamCity);

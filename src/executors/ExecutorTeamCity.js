import { default as TeamCity } from 'teamcity-rest-api';
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

        if (jobName == null) {
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

        //TO-DO: parse the following parameters from the statistics result xml feed, "FailedTestCount", "PassedTestCount", "TotalTestCount"
        //let stats = this.getBuildStatistics(this.options.GTM_TEAMCITY_URL+completedBuild.statistics, jobName, teamCityBuildId.id);

        let result = completedBuild.status === 'SUCCESS';
        return { passed: result, url: completedBuild.buildType.webUrl };
    }

    async waitForBuildToComplete(buildName, buildNumber) {
        let buildDict = await this.teamCity.builds.get(buildNumber);

        let tries = 1;
        while (buildDict.state !== 'finished') {
            await AgentUtils.timeout(5000);
            buildDict = await this.teamCity.builds.get(buildNumber).then(function(data) {
                log.debug(`Waiting for Build '${buildName}' to Finish: ${tries++}`);
                return data;
            });
        }
        log.debug(`TeamCity Project[${buildName}] with buildNumber : #${buildNumber} : ${buildDict.state}`);
        return buildDict;
    }

    /*
    getBuildStatistics(statsUrl, buildName, buildNumber) {

        log.debug(statsUrl);

        request(statsUrl, { json: true }, (err, res, body) => {
            if (err) { return log.error(err); }
            log.debug(body.url);
            log.debug(body.explanation);
        });
    }*/
}

Executor.register('TeamCity', ExecutorTeamCity);

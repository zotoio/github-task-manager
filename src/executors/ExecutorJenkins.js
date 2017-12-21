import { default as TeamCity } from 'teamcity-rest-api';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
import { default as json } from 'format-json';
let log = Utils.logger();

export class ExecutorTeamCity extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.runFunctions = {};
        this.runFunctions['pull_request'] = this.executeForPullRequest;

        this.teamCity = TeamCity.create({
            url: this.options.GTM_TEAMCITY_URL,
            username: this.options.GTM_TEAMCITY_USER,
            password: this.options.GTM_TEAMCITY_PASSCODE
        });
    }

    run(fn) {
        return this.runFunctions[fn];
    }

    async executeForPullRequest(task) {
        log.info('TeamCity Build Finished');
        log.debug(task);
        return { passed: true, url: this.options.GTM_TEAMCITY_URL + '/viewType.html?buildTypeId=' + jobName };

    }

    createTeamCityBuildNode(task, jobName) {
        var buildProperties = '';
        for(var buildProperty in task.options) {
            buildProperties = buildProperties + '<property name="' + buildProperty + '" value="' + task.options[buildProperty] + '"/>\n';
        }

        let buildNodeObject = '<build>\n' +
            '<buildType id="' + jobName + '" />\n' +
            '<properties>\n' +
                buildProperties +  
            '</properties>\n' + 
            '</build>';

        return buildNodeObject;
    }

    async executeTask(task) {

        let jobName = task.context;

        if (jobName == null) {
            await Utils.timeout(4000);
            return 'NO_MATCHING_TASK';
        }

        log.info('TeamCity Project[' + jobName + '] Started.');

        let buildNode = this.createTeamCityBuildNode(task, jobName);
        log.debug('TeamCity Project[' + jobName + '] buildNode : ' + buildNode);
                
        this.teamCity.builds.startBuild(buildNode)
        .then(function(buildStatus) {
                console.log(buildStatus.id);
                this.teamCity.builds.get(buildStatus.id)
                .then(function(_build) {
                    while(!_build.state === 'finished') {
                      console.log(_build.state);  
                    }
                    console.log(_build.statistics);
                });
        });

        //to-do
        //once build is finished, get the statistics from [this.options.GTM_TEAMCITY_URL + _build.statistics] and post the results

        let result = true;
        log.info('Build Finished: ' + result);
        return { passed: result, url: this.options.GTM_TEAMCITY_URL + '/viewType.html?buildTypeId=' + jobName };
    }
}

Executor.register('TeamCity', ExecutorTeamCity);

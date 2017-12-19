//import { default as TeamCity } from 'teamcity-rest-api';
import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import { default as json } from 'format-json';
let log = AgentUtils.logger();

export class ExecutorTeamCity extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();

        this.runFunctions = {};
        this.runFunctions['pull_request'] = this.executeForPullRequest;

        /*this.teamCity = TeamCity.create({
            url: 'http://localhost:8111',
            username: 'user',
            password: 'pass'
        });*/
    }

    run(fn) {
        return this.runFunctions[fn];
    }

    async executeForPullRequest(task) {
        //let jobName = this.taskNameToBuild(taskName);

        log.info(`teamcity options: ${json.plain(task.options)}`);

        /*
        let buildNodeObject = '<build>' +
            '<buildType id="TestConfigId" />' +
            '</build>';

        this.teamCity.builds.startBuild(buildNodeObject)
            .then(function(buildStatus) {
                log.debug(buildStatus.id);
            });
            */

        let result = true;
        log.info('Build Finished: ' + result);
        return { passed: result, url: 'https://www.jetbrains.com/teamcity' };
    }

    async executeTask(task) {
        log.info('TeamCity Build Finished');
        log.debug(task);
        return { passed: true, url: 'https://www.jetbrains.com/teamcity' };
    }
}

Executor.register('TeamCity', ExecutorTeamCity);

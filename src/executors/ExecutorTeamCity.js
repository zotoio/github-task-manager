//import { default as TeamCity } from 'teamcity-rest-api';
import { Executor } from '../agent/Executor';
import { Utils } from '../agent/AgentUtils';
let log = Utils.logger();

export class ExecutorTeamCity extends Executor {

    constructor(options) {
        super();
        this.options = options;
        /*this.teamCity = TeamCity.create({
            url: 'http://localhost:8111',
            username: 'user',
            password: 'pass'
        });*/
    }

    info() {
        this.executeTask('Functional', {test: 'Testing'});
        return 'Auto-Registered Executor for TeamCity';
    }

    taskNameToBuild(taskName) {
        log.debug(taskName);
        return 'EXECUTE_AUTOMATED_TESTS';
    }

    async executeTask(taskName, buildParams) {
        //let jobName = this.taskNameToBuild(taskName);

        log.debug(buildParams);

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
        return result;
    }

}

Executor.register('TeamCity', ExecutorTeamCity);
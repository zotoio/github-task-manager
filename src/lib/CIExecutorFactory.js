import {JenkinsCIExecutor} from './JenkinsCIExecutor';
import {TeamCityCIExecutor} from './TeamCityCIExecutor';

export class CIExecutorFactory {

    constructor() {
        this.factoryEnabled = true;
        this.execInstance = JenkinsCIExecutor;
    }

    createCIExecutor(execType, options = null) {
        switch (execType) {
        case 'CI_JENKINS': this.execInstance = JenkinsCIExecutor; break;
        case 'CI_TEAMCITY': this.execInstance = TeamCityCIExecutor; break;
        }
        return new this.execInstance(options);
    }

}
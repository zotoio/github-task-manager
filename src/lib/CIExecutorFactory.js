import {JenkinsCIExecutor} from './JenkinsCIExecutor';
import {TeamCityCIExecutor} from './TeamCityCIExecutor';

class CIExecutorFactory {

    static get CITypeJenkins() {
        return 'CI_TYPE_JENKINS';
    }

    static get CITypeTeamCity() {
        return 'CI_TYPE_TEAMCITY';
    }

    constructor() {
        this.factoryEnabled = true;
        this.execInstance = JenkinsCIExecutor;
    }

    createCIExecutor(execType, options = null) {
        if(!this.factoryEnabled)
            return null;
        switch(execType) {
            case this.CITypeJenkins:
                this.execInstance = JenkinsCIExecutor;
                break;
            case this.CITypeTeamCity:
                this.execInstance = TeamCityCIExecutor;
                break;
        }
        return new this.execInstance(options)
    }

}
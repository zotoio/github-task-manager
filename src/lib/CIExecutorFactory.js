'use strict';

import {CIExecutorJenkins} from './CIExecutorJenkins';
import {CIExecutorTeamCity} from './CIExecutorTeamCity';

export class CIExecutorFactory {

    constructor() {
        this.factoryEnabled = true;
        this.execInstance = CIExecutorJenkins;
    }

    createCIExecutor(execType, options = null) {
        switch (execType) {
        case 'CI_JENKINS': this.execInstance = CIExecutorJenkins; break;
        case 'CI_TEAMCITY': this.execInstance = CIExecutorTeamCity; break;
        }
        return new this.execInstance(options);
    }

}
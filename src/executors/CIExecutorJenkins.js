import { CIExecutor } from '../lib/CIExecutor';

export class CIExecutorJenkins extends CIExecutor {

    constructor(options) {
        super();
        this.options = options;
    }

    info() {
        return 'Auto-Registered Executor for Jenkins';
    }

}

CIExecutor.register('Jenkins', CIExecutorJenkins);
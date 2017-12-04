'use strict';
import requireDir from 'require-dir';
import { SelfRegisteringSubClass } from './SelfRegisteringSubClass';

/**
 * Create a CI Executor to run Builds, Deploys, and Tests
 */
export class CIExecutor extends SelfRegisteringSubClass {

    /**
     * Initialise the CI Executor
     * @param {String} name - Class Name to Create
     * @param {*} options - Object of Options to pass into Class
     */
    constructor(name, options) {
        super();
        return CIExecutor.create(name, options);
    }

    executeTask() {
        // Override in Implementation
        // This will need to be a promise so we can chain and get results back
    }

    describeExecutor() {
        console.log(this.options);
    }
}

requireDir('../executors');
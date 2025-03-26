import { default as fs } from 'fs';
import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Executor } from '../../src/agent/Executor';
import { ExecutorDockerServerless } from '../../src/executors/ExecutorDockerServerless';

describe('ExecutorDockerServerless', () => {
    let executorDockerServerless;
    let eventData;
    process.env.GTM_DOCKER_ALLOW_PULL = 'false';

    beforeEach(() => {
        eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/push.json', 'utf-8'));
        executorDockerServerless = new ExecutorDockerServerless(eventData, console);
    });

    describe('constructor', () => {
        it('should instantiate as Executor', () => {
            assert.equal(executorDockerServerless instanceof Executor, true);
        });
    });

    describe('identifyChangedPackages', () => {
        it('should find distinct packages', () => {
            let expected = [
                'lambdaAbc',
                'lambdaDef',
                'lambdaHij',
                'lambdaKlm',
                'lambdaOne',
                'lambdaTwo',
                'lambdaFour',
                'lambdaThree',
            ];

            let packages = executorDockerServerless.packagesToDeploy;
            assert.deepEqual(packages, expected);
        });
    });
});

import { default as fs } from 'fs';
import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Plugin } from '../../src/agent/Plugin';
import { Executor } from '../../src/agent/Executor';

describe('Executor', function () {
    let executor;
    beforeEach(() => {
        process.env.GTM_AWS_KMS_KEY_ID = '';
        let eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubEventPayload.json', 'utf-8'));
        executor = new Executor(eventData, console);
    });

    describe('constructor', function () {
        it('should instantiate as Plugin', function () {
            assert.equal(executor instanceof Plugin, true);
        });
    });

    describe('getOptions', function () {
        it('should return environment', function () {
            assert.equal(executor.getOptions(), process.env);
        });
    });
});

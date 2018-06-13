//import { default as fs } from 'fs';
import { describe, it, beforeEach, before } from 'mocha';
import { default as assert } from 'assert';
import { Agent } from '../../src/agent/Agent';

describe('Agent', function() {
    let AGENT_GROUP;

    let systemConfig = {};
    let agentObj;

    beforeEach(() => {
        agentObj = new Agent();
    });

    before(() => {
        AGENT_GROUP = process.env.GTM_AGENT_GROUP || 'default';
        systemConfig.agentGroup = AGENT_GROUP;
    });

    describe('systemConfig', function() {
        it('should return systemConfig values', function() {
            let actual = Agent.systemConfig;
            for (let i = 1; i < 5; i++) {
                assert.equal(actual[i], systemConfig[i]);
            }
        });
    });

    describe('start', () => {
        before(() => {
            process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID = 'aws_key_id';
            process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY = 'aws_key_secret';
            process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET = 'webhook_secret';
        });

        it('should start the agent', () => {
            agentObj.start();
        });
    });
});

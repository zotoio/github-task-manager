//import { default as fs } from 'fs';
import { describe, it, beforeEach, before, after } from 'mocha';
import { default as assert } from 'assert';
import { Agent } from '../../src/agent/Agent';
import { AgentMetrics } from '../../src/agent/AgentMetrics';
import { Consumer } from 'sqs-consumer';
import { default as sinon } from 'sinon';
import { AgentUtils } from '../../src/agent/AgentUtils';

describe('Agent', function () {
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

    describe('systemConfig', function () {
        it('should return systemConfig values', function () {
            let actual = Agent.systemConfig;
            for (let i = 1; i < 5; i++) {
                assert.equal(actual[i], systemConfig[i]);
            }
        });
    });

    describe('start', () => {
        let stubCall;
        let stubUtils;
        let stubListen;
        let stubMetrics;
        let customResult = { on: () => {} };
        before(() => {
            process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID = 'aws_key_id';
            process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY = 'aws_key_secret';
            process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET = 'webhook_secret';

            customResult = {};
            stubCall = sinon.stub(Consumer, 'create').returns(Promise.resolve(customResult));
            stubUtils = sinon.stub(AgentUtils, 'getQueueUrl').returns(Promise.resolve(customResult));
            stubListen = sinon.stub(Agent.prototype, 'listen').returns(() => {});
            stubMetrics = sinon.stub(AgentMetrics, 'configureRoutes').returns(Promise.resolve(customResult));
        });

        it('should start the agent', () => {
            agentObj.start();
        });

        after(() => {
            stubCall.restore();
            stubUtils.restore();
            stubListen.restore();
            stubMetrics.restore();
        });
    });
});

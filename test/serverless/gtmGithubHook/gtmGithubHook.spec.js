import { default as assert } from 'assert';
import { describe, it } from 'mocha';
import { default as crypto } from 'crypto';
import { decodeEventBody, listener, handleEvent } from '../../../src/serverless/gtmGithubHook/gtmGithubHook.js';

describe('gtmGithubHook', function() {
    describe('decodeEventBody', function () {
        it('should remove prefix and parse body', function (done) {

            let expected = {"action": "test"};
            let event = {};
            event.body = "payload=%7B%22action%22%3A%20%22test%22%7D";

            let actual = decodeEventBody(event);
            assert.equal(actual.action, expected.action);
            done();

        });
    });
    describe('listener', function () {
        it('should run', function (done) {

            let expected = {"action": "test"};
            let event = {};
            event.type = 'pull_request';
            event.body = "payload=%7B%22action%22%3A%20%22test%22%7D";

            let key = 'abc';
            process.env.GTM_GITHUB_WEBHOOK_SECRET = key;
            let sig = `sha1=${crypto.createHmac('sha1', key).update(event.body, 'utf-8').digest('hex')}`;

            event.headers = {
                'X-Hub-Signature': sig,
                'X-GitHub-Event': 'test',
                'X-GitHub-Delivery': 'test'
            };

            listener(event, null, ()=>{});
            assert.equal('1', '1'); //todo
            done();

        });
    });
    describe('handleEvent', function () {
        it('should fire', function (done) {

            let type = 'pull_request';
            let body = {"action": "test"};

            handleEvent(type, body);
            assert.equal(1, 1); //todo
            done();

        });
    });

});
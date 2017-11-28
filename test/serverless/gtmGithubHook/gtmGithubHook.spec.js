import { default as assert } from 'assert';
import { describe, it } from 'mocha';
import { decodeEventBody } from '../../../src/serverless/gtmGithubHook/gtmGithubHook.js';

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

});
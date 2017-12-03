import { describe, it } from 'mocha';
import { default as assert } from 'assert';
import { default as githubResults } from '../../../src/serverless/gtmGithubResults/gtmGithubResults.js';

describe('gtmGithubResults', function() {
    describe('handle', function () {
        it('should fire callback', async function () {

            let expected = {
                statusCode: 401,
                headers: {'Content-Type': 'text/plain'}
            };

            let actual = await githubResults.handle({}, null, () => {return expected;});
            assert.equal(actual.statusCode, expected.statusCode);

        });
    });

    describe('getQueue', function () {
        it('should throw without config', async function () {
            try {
                await githubResults.getQueue();
            } catch (e) {
                assert.equal('Missing SQS consumer option [queueUrl].', e.message);
            }

        });
    });

});

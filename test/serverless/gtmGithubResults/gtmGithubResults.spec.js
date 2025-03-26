import { describe, it } from 'mocha';
import { default as assert } from 'assert';
import { default as githubResults } from '../../../src/serverless/gtmGithubResults/gtmGithubResults.js';

describe('gtmGithubResults', function () {
    describe('handle', function () {
        it('should fire callback', async function () {
            let expected = {
                statusCode: 401,
                headers: { 'Content-Type': 'text/plain' },
            };

            let actual;
            try {
                actual = await githubResults.handle({}, null, () => {
                    return expected;
                });
            } catch (e) {
                console.log(e.message);
            }
            assert.equal(actual.statusCode, expected.statusCode);
        });
    });

    describe('getQueue', function () {
        it('should throw without config', async function () {
            process.env.SQS_RESULTS_QUEUE_URL = '';
            try {
                await githubResults.getQueue();
                assert.fail('Should have thrown error about missing queue URL');
            } catch (e) {
                assert.ok(e.message.includes('queueUrl'), `Expected queueUrl error but got: ${e.message}`);
            }
        });
    });
});

import { describe, it } from 'mocha';
import { default as assert } from 'assert';
import { default as crypto } from 'crypto';
import { default as githubUtils } from '../../src/serverless/gtmGithubUtils.js';

describe('gtmGithubUtils', function() {
    describe('connect', function() {
        it('should throw without creds', function(done) {
            assert.throws(githubUtils.connect, Error);
            done();
        });
    });

    describe('signRequestBody', function() {
        it('should encrypt correctly', function(done) {
            let key = 'abc';
            let body = 'def';

            let expected = `sha1=${crypto
                .createHmac('sha1', key)
                .update(body, 'utf-8')
                .digest('hex')}`;

            let actual = githubUtils.signRequestBody(key, body);
            assert.equal(actual, expected);
            done();
        });
    });

    describe('invalidHook', function() {
        it('should return error if event header missing', function(done) {
            process.env.GTM_GITHUB_WEBHOOK_SECRET = 'abc';

            let event = {
                body: 'testing',
                headers: {
                    'X-Hub-Signature': 'test'
                }
            };

            let expected = 'Error: No X-Github-Event found on request';
            let actual = githubUtils.invalidHook(event);
            assert.equal(actual, expected);
            done();
        });
    });

    describe('decodeFileResponse', function() {
        it('should base64 decode', function(done) {
            let fileResponse = {
                data: {
                    content: 'eyJhYmMiOiAidGhpcyBpcyBhIHRlc3QifQo=' //base64 { abc: 'this is a test' }
                }
            };

            let actual = githubUtils.decodeFileResponse(fileResponse);
            assert.equal(actual.abc, 'this is a test');
            done();
        });
    });

    describe('updateGitHubPullRequest', function() {
        it('should throw exception when not logged in', async function() {
            let message = {
                Body:
                    '{"context": "test", "eventData": { "ghEventId": "abc", "ghEventType": "pull_request"}}'
            };

            let actual;
            try {
                actual = await githubUtils.handleEventTaskResult(message);
                console.log(actual);
            } catch (e) {
                return assert.equal(
                    e.message,
                    'OAuth2 authentication requires a token or key & secret to be set'
                );
            }
        });
    });

    describe('getFile', function() {
        it('should throw exception when not logged in', async function() {
            let actual;
            try {
                actual = await githubUtils.getFile();
                console.log(actual);
            } catch (e) {
                return assert.equal(
                    'OAuth2 authentication requires a token or key & secret to be set',
                    e.message
                );
            }
        });
    });
});

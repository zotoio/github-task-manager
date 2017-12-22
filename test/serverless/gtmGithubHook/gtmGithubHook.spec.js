import { default as sinon } from 'sinon';
import { default as assert } from 'assert';
import { before, after, describe, it } from 'mocha';
import { default as crypto } from 'crypto';
import { default as gtmGithubHook } from '../../../src/serverless/gtmGithubHook/gtmGithubHook.js';
import { default as githubUtils } from '../../../src/serverless/gtmGithubUtils.js';

describe('gtmGithubHook', function() {
    describe('decodeEventBody', function() {
        it('should remove prefix and parse body', function(done) {
            let expected = { action: 'test' };
            let event = {};
            event.body = 'payload=%7B%22action%22%3A%20%22test%22%7D';

            let actual = gtmGithubHook.decodeEventBody(event);
            assert.equal(actual.action, expected.action);
            done();
        });
    });
    describe('listener', function() {
        it('should run', function(done) {
            let event = {};
            event.type = 'pull_request';
            event.body = 'payload=%7B%22action%22%3A%20%22test%22%7D';

            let key = 'abc';
            process.env.GTM_GITHUB_WEBHOOK_SECRET = key;
            let sig = `sha1=${crypto
                .createHmac('sha1', key)
                .update(event.body, 'utf-8')
                .digest('hex')}`;

            event.headers = {
                'X-Hub-Signature': sig,
                'X-GitHub-Event': 'test',
                'X-GitHub-Delivery': 'test'
            };

            gtmGithubHook.listener(event, null, () => {});
            assert.equal('1', '1'); //todo
            done();
        });
    });
    describe('handleEvent', function() {
        it('should fire', function(done) {
            let type = 'pull_request';
            let body = {
                pull_request: {
                    ref: 'sha123',
                    head: {
                        repo: {
                            name: 'code',
                            owner: {
                                login: 'bob'
                            }
                        }
                    }
                }
            };

            gtmGithubHook.handleEvent(type, body);
            assert.equal(1, 1); //todo
            done();
        });
    });

    describe('getTaskConfig', function() {
        let config = {
            pull_request: {
                tasks: [
                    {
                        executor: 'jenkins',
                        context: 'functional',
                        options: {
                            tags: ['@smoke'],
                            browsers: ['chrome']
                        }
                    }
                ]
            }
        };

        before(function() {
            sinon.stub(githubUtils, 'getFile').callsFake(() => {
                return Promise.resolve({
                    data: {
                        content: Buffer.from(JSON.stringify(config)).toString('base64')
                    }
                });
            });
        });

        after(function() {
            githubUtils.getFile.restore();
        });

        it('should extract json from github file response', async function() {
            let body = {
                pull_request: {
                    ref: 'sha123',
                    head: {
                        repo: {
                            name: 'code',
                            owner: {
                                login: 'bob'
                            }
                        }
                    }
                }
            };

            //gtmGithubHook.setUtils(githubUtils);
            let actual = await gtmGithubHook.getTaskConfig('pull_request', body);
            return assert.equal(actual.pull_request.tasks[0].executor, 'jenkins');
        });
    });
});

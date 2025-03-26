import { default as sinon } from 'sinon';
import { default as assert } from 'assert';
import { before, after, describe, it, beforeEach } from 'mocha';
import { default as crypto } from 'crypto';
import { default as gtmGithubHook } from '../../../src/serverless/gtmGithubHook/gtmGithubHook.js';
import { default as githubUtils } from '../../../src/serverless/gtmGithubUtils.js';
import { Producer } from 'sqs-producer';

describe('gtmGithubHook', function () {
    beforeEach(() => {
        process.env.GTM_AWS_KMS_KEY_ID = '';
    });
    describe('decodeEventBody', function () {
        it('should remove prefix and parse body', function (done) {
            let expected = { action: 'test' };
            let event = {};
            event.body = 'payload=%7B%22action%22%3A%20%22test%22%7D';

            let actual = gtmGithubHook.decodeEventBody(event);
            assert.equal(actual.action, expected.action);
            done();
        });
    });
    describe('listener', function () {
        let stubCall;
        let customResult;
        before(() => {
            process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID = 'aws_key_id';
            process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY = 'aws_key_secret';
            process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET = 'webhook_secret';

            customResult = {};
            stubCall = sinon.stub(Producer, 'create').returns(Promise.resolve(customResult));
        });
        it('should run', function (done) {
            let event = {};
            event.type = 'pull_request';
            event.body =
                'payload=%7B%22pull_request%22%3A%20%7B%22ref%22%3A%20%22sha123%22%2C%22head%22%3A%20%7B%22repo%22%3A%20%7B%22name%22%3A%20%22code%22%2C%20%22owner%22%3A%20%7B%20%22login%22%3A%20%22bob%22%20%7D%7D%7D%7D%7D';

            let key = 'abc';
            process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET = key;
            let sig = `sha1=${crypto.createHmac('sha1', key).update(event.body, 'utf-8').digest('hex')}`;

            event.headers = {
                'X-Hub-Signature': sig,
                'X-GitHub-Event': 'test',
                'X-GitHub-Delivery': 'test',
            };

            gtmGithubHook.listener(event, null, () => {});
            assert.equal('1', '1'); //todo
            done();
        });
        after(() => {
            stubCall.restore();
        });
    });

    describe('getTaskConfig', function () {
        let config = {
            pull_request: {
                tasks: [
                    {
                        executor: 'jenkins',
                        context: 'functional',
                        options: {
                            tags: ['@smoke'],
                            browsers: ['chrome'],
                        },
                    },
                ],
            },
        };

        before(function () {
            sinon.stub(githubUtils, 'getFile').callsFake(() => {
                return Promise.resolve({
                    data: {
                        content: Buffer.from(JSON.stringify(config)).toString('base64'),
                    },
                });
            });
        });

        after(function () {
            githubUtils.getFile.restore();
        });

        it('should extract json from github file response', async function () {
            let body = {
                pull_request: {
                    ref: 'sha123',
                    head: {
                        repo: {
                            name: 'code',
                            owner: {
                                login: 'bob',
                            },
                        },
                    },
                },
            };

            //gtmGithubHook.setUtils(githubUtils);
            let actual = await gtmGithubHook.getTaskConfig('pull_request', body);
            return assert.equal(actual.pull_request.tasks[0].executor, 'jenkins');
        });
    });
});

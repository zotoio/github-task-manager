import { describe, it } from 'mocha';
//import { expect } from 'chai';
//import supertest from 'supertest';
import integration from './_integration.spec-int.js';
import githubUtils from '../src/serverless/gtmGithubUtils.js';
import { default as json } from 'format-json';
import { default as firstline } from 'firstline';

import { default as util } from 'util';
import { default as dotenv } from 'dotenv';

dotenv.config();

describe('GitHub Task Manager', () => {
    describe('should correctly update a pull request', () => {
        /**
         * 1. fork github repo from template at github.com/wyvern8/gtm-test
         * 2. add webhook with secret
         * 3. create a branch
         * 4. create a file
         * 5. open a pull request back to master
         *
         */

        //console.log(integration);
        //let request = supertest(integration.urlPrefix);

        it('should trigger behaviors if hostname matches exactly', async () => {
            let testName = `test_${Date.now()}`;
            let hookUrl = await firstline('./sls-hook-url.out');
            console.log(`hook url: ${hookUrl}`);
            let github = githubUtils.connect();

            let gh = {
                repos: {
                    fork: util.promisify(github.repos.fork),
                    createHook: util.promisify(github.repos.createHook),
                    createFile: util.promisify(github.repos.createFile)
                },
                gitdata: {
                    getReference: util.promisify(github.gitdata.getReference),
                    createReference: util.promisify(
                        github.gitdata.createReference
                    )
                },
                pullRequests: {
                    create: util.promisify(github.pullRequests.create)
                }
            };

            return gh.repos
                .fork({
                    owner: 'wyvern8',
                    repo: integration.config.testRepoName
                })
                .then(function(res) {
                    console.log(`fork: ${json.plain(res)}`);

                    return gh.repos.createHook({
                        owner: process.env.GTM_GITHUB_OWNER,
                        repo: integration.config.testRepoName,
                        name: 'web',
                        events: ['pull_request'],
                        active: true,
                        config: {
                            url: hookUrl,
                            secret: process.env.GTM_GITHUB_WEBHOOK_SECRET
                        }
                    });
                })
                .then(function(res) {
                    console.log(`hook: ${json.plain(res)}`);

                    return gh.gitdata.getReference({
                        owner: process.env.GTM_GITHUB_OWNER,
                        repo: integration.config.testRepoName,
                        ref: 'heads/master'
                    });
                })
                .then(function(res) {
                    console.log(`master: ${json.plain(res)}`);

                    let sha = res.data.object.sha;

                    return gh.gitdata.createReference({
                        owner: process.env.GTM_GITHUB_OWNER,
                        repo: integration.config.testRepoName,
                        ref: `refs/heads/${testName}`,
                        sha: sha
                    });
                })
                .then(function(res) {
                    console.log(`branch: ${json.plain(res)}`);

                    return gh.repos.createFile({
                        owner: process.env.GTM_GITHUB_OWNER,
                        repo: integration.config.testRepoName,
                        path: `${testName}.txt`,
                        content: Buffer.from(testName.toString()).toString(
                            'base64'
                        ),
                        message: `updated/${testName}.txt`,
                        branch: `refs/heads/${testName}`
                    });
                })
                .then(function(res) {
                    console.log(`file: ${json.plain(res)}`);

                    return gh.pullRequests.create({
                        owner: process.env.GTM_GITHUB_OWNER,
                        repo: integration.config.testRepoName,
                        title: `new file: ${testName}.txt`,
                        head: `refs/heads/${testName}`,
                        base: 'refs/heads/master'
                    });
                })
                .then(function(res) {
                    console.log(`pull_request: ${json.plain(res)}`);
                });
        });
    });
});

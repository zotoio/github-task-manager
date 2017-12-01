'use strict';

let json = require('format-json');
let consumer = require('sqs-consumer');
let GitHubApi = require('github');

async function handle(event, context, callback) {

    /* eslint-disable */
    console.log('---------------------------------');
    console.log(`Github-Results: `);
    console.log('---------------------------------');
    console.log('Payload', json.plain(event));
    /* eslint-enable */

    try {

        let consumer = await getQueue();

        consumer.on('error', (err) => {
            console.log(err.message);
            throw err;
        });

        consumer.on('empty', () => {
            console.log('results queue is empty.');
            consumer.stop();
            const response = {
                statusCode: 200,
                body: JSON.stringify({
                    input: event,
                }),
            };
            return callback(null, response);
        });

        consumer.start();


    } catch (e) {
        console.log(e);
        return callback(null, {
            statusCode: 401,
            headers: {'Content-Type': 'text/plain'},
            body: e.message,
        });
    }

}

async function getQueue() {

    return await consumer.create({
        queueUrl: process.env.SQS_RESULTS_QUEUE_URL,
        waitTimeSeconds: 10,
        handleMessage: updateGitHubPullRequest
    });

}

async function updateGitHubPullRequest(message, done) {

    let status = JSON.parse(message.Body);

    let githubOptions = {
        host: process.env.GTM_GITHUB_HOST ? process.env.GTM_GITHUB_HOST : 'api.github.com',
        debug: process.env.GTM_GITHUB_DEBUG ? process.env.GTM_GITHUB_DEBUG : false,
        timeout: process.env.GTM_GITHUB_TIMEOUT ? parseInt(process.env.GTM_GITHUB_TIMEOUT) : 5000,
        pathPrefix: process.env.GTM_GITHUB_PATH_PREFIX ? process.env.GTM_GITHUB_PATH_PREFIX : '',
        proxy: process.env.GTM_GITHUB_PROXY ? process.env.GTM_GITHUB_PROXY : ''
    };

    let github = new GitHubApi(githubOptions);

    let token = (process.env['GTM_GITHUB_TOKEN_' + (status.context).toUpperCase().replace('-', '_')])
        || process.env.GTM_GITHUB_TOKEN;

    github.authenticate({
        type: 'oauth',
        token: token
    });

    /*let review = {
        owner: 'wyvern8',
        repo: 'sandpit',
        number: 10,
        body: '<b>test review comment</b>',
        id: '2b4da05008abbfbaa408a49661335270e2f0a15f',
        event: 'COMMENT'
    };

    github.pullRequests.submitReview(review);*/

    /*status = {
        owner: 'wyvern8',
        repo: 'sandpit',
        sha: '2b4da05008abbfbaa408a49661335270e2f0a15f',
        state: 'success',
        target_url: 'http://www.google.com',
        description: 'The test passed',
        context: 'Functional Test'
    };*/

    console.log(status);

    github.repos.createStatus(status);

    done();

}
module.exports = {
    "handle": handle
};

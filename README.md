# github-task-manager

[![npm version](https://badge.fury.io/js/github-task-manager.svg)](https://badge.fury.io/js/github-task-manager)
[![Build Status](https://travis-ci.org/wyvern8/github-task-manager.svg?branch=master)](https://travis-ci.org/wyvern8/github-task-manager)
[![Code Climate](https://img.shields.io/codeclimate/maintainability/wyvern8/github-task-manager.svg)](https://codeclimate.com/github/wyvern8/github-task-manager)
[![Test Coverage](https://codeclimate.com/github/wyvern8/github-task-manager/badges/coverage.svg)](https://codeclimate.com/github/wyvern8/github-task-manager/coverage)
[![Greenkeeper badge](https://badges.greenkeeper.io/wyvern8/github-task-manager.svg)](https://greenkeeper.io/)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?clear)](http://commitizen.github.io/cz-cli/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

receive github hook, notify agent, receive task results, notify github

-= **work in progress ** =-

## Aim
Create an asynchronous CI agnostic mechanism for running custom test stage gates for github pull requests.
- trigger multiple jobs in parallel and indicate pending status on pr checks
- then add results for each back to pull request check as they complete

## Design draft RFC

- Deploy two functions to lambda via serverless framework ('pending', 'results')
- github hooks pointed at 'pending' lambda which adds a 'job' to a 'pending' SQS queue
- ci host agent(s) watch SQS for new test execution jobs
- ci host adds results to a 'results' SQS queue, notifies SNS topic which triggers 'results' lambda
- results lambda posts results to github pull request.

## Install
- clone this repo (TODO: or `npm install --save-dev serverless`)
- npm install
- setup serverless aws creds per https://github.com/serverless/serverless/blob/master/docs/providers/aws/guide/credentials.md
- setup a .env file in the repo root
```
GTM_AWS_REGION=ap-southeast-2
GTM_GITHUB_WEBHOOK_SECRET=<github hook secret>
GTM_SQS_PENDING_QUEUE=gtmPendingQueue
GTM_SQS_RESULTS_QUEUE=gtmResultsQueue
```
- run: `npm run sls-deploy` - note that this will create aws resources..
- capture the hook url output in console and add to github pull request conf
- run: `npm run sls-logs-hook` to tail the logs
- create a pull request and confirm the hook is being hit
- **IN PROGRESS**: add event body to SQS

## Contributing

Fork this repository and work on your enhancements, then send a pull request.

Use commitizen for conventional commit messages via `git cz` instead of `git commit`.  
To setup if not already installed:
```
npm install -g commitizen
npm install -g cz-conventional-changelog
echo '{ "path": "cz-conventional-changelog" }' > ~/.czrc
```
..or you can just use `npm run commit` which will use local commitizen install.

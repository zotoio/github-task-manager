# github-task-manager

[![npm version](https://badge.fury.io/js/github-task-manager.svg)](https://badge.fury.io/js/github-task-manager)
[![Build Status](https://travis-ci.org/wyvern8/github-task-manager.svg?branch=master)](https://travis-ci.org/wyvern8/github-task-manager)
[![Code Climate](https://img.shields.io/codeclimate/maintainability/wyvern8/github-task-manager.svg)](https://codeclimate.com/github/wyvern8/github-task-manager)
[![Test Coverage](https://codeclimate.com/github/wyvern8/github-task-manager/badges/coverage.svg)](https://codeclimate.com/github/wyvern8/github-task-manager/coverage)
[![Greenkeeper badge](https://badges.greenkeeper.io/wyvern8/github-task-manager.svg)](https://greenkeeper.io/)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?clear)](http://commitizen.github.io/cz-cli/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Docker Build Status](https://img.shields.io/docker/build/wyvern8/github-task-manager.svg)](https://hub.docker.com/r/wyvern8/github-task-manager)

receive github hook, notify agent, receive task results, notify github (Unofficial)

<a href="https://github.com/wyvern8/github-task-manager">
  <img src="https://raw.githubusercontent.com/wyvern8/github-task-manager/master/gtm-logo.png?raw=true&1" alt="" title="logo" align="right" style="max-width:160px">
</a>

## Aim
Create an asynchronous CI agnostic mechanism for running custom test stage gates for github pull requests.
- trigger multiple jobs in parallel and indicate pending status on pr checks
- then add results for each back to pull request check as they complete
- make extensible for other github event/task handling



## Design

- Deploy two functions to lambda via serverless framework ('gtmGithubHook', 'gtmGithubResults')
- github PR open hook pointed at 'gtmGithubHook' lambda which adds event to a 'PendingQueue' SQS queue
- agent(s) watch SQS for new test execution jobs
- agent notifies 'ResultsQueue' SQS queue that a task has started (lambda updates github PR state)
- agent triggers CI PR build, deploy and tests (plugin for each CI type)
- agent formats and adds test results to 'ResultsQueue' SQS queue
- agent notifies SNS topic which triggers 'gtmGithubResults' lambda
- 'gtmGithubResults' lambda posts results to github pull request.

<a href="https://github.com/wyvern8/github-task-manager">
  <img src="https://raw.githubusercontent.com/wyvern8/github-task-manager/master/github-task-manager.png?raw=true" alt="" title="github-task-manager flow">
</a>

## Install
- clone this repo (TODO: or `npm install --save-dev github-task-manager`)
- npm install
- setup serverless aws creds per https://github.com/serverless/serverless/blob/master/docs/providers/aws/guide/credentials.md
- setup a .env file in the repo root (copy from .envExample and modify)

| Environment variable | description |
| -------------------- | ----------- |
|GTM_AWS_REGION | awsregion to create resources in |
|GTM_SQS_PENDING_QUEUE | name of SQS queue for new event |
|GTM_SQS_RESULTS_QUEUE | name of SQS queue for results |
|GTM_SNS_RESULTS_TOPIC | name of SNS topic for result ping |
|GTM_GITHUB_WEBHOOK_SECRET | shared secret from github webook config |
|GTM_GITHUB_TOKEN | access token for accessing github |
|GTM_GITHUB_TOKEN_FUNCTIONAL_TESTS | access token for individual test type.  each task type can have a different token |
|GTM_GITHUB_HOST | api hostname can be updated for github enterprise |
|GTM_GITHUB_DEBUG | debug mode for api calls |
|GTM_GITHUB_TIMEOUT | github api timeout |
|GTM_GITHUB_PATH_PREFIX | path prefix for github enterprise |
|GTM_GITHUB_PROXY | github api client proxy |
|GTM_TASK_CONFIG_FILENAME | filename in repo to look for for task config - default is .githubTaskManager |
|AWS_ACCESS_KEY_ID | aws key id - for agent only, do not add to .env |
|AWS_SECRET_ACCESS_KEY | aws secret - for agent only, do not add to .env |

- run: `npm run sls-deploy` - note that this will create aws re$ources..
- capture the hook url output in console and add to github repo pull request conf
- run: `npm run sls-logs-hook` or `npm run sls-logs-results` to tail the logs
- create a pull request and confirm the hook is being hit

## Plugins
Task executors for Jenkins, Teamcity and Travis are in progress. Custom task executors can be added by.. **todo**

Executors contain the logic to run tasks against a given system type, and format the results.

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

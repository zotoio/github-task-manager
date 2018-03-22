# github-task-manager

[![npm version](https://badge.fury.io/js/github-task-manager.svg)](https://badge.fury.io/js/github-task-manager)
[![Build Status](https://travis-ci.org/zotoio/github-task-manager.svg?branch=master)](https://travis-ci.org/zotoio/github-task-manager)
[![Code Climate](https://img.shields.io/codeclimate/maintainability/zotoio/github-task-manager.svg)](https://codeclimate.com/github/zotoio/github-task-manager)
[![Test Coverage](https://codeclimate.com/github/zotoio/github-task-manager/badges/coverage.svg)](https://codeclimate.com/github/zotoio/github-task-manager/coverage)
[![Greenkeeper badge](https://badges.greenkeeper.io/zotoio/github-task-manager.svg)](https://greenkeeper.io/)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?clear)](http://commitizen.github.io/cz-cli/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Docker Build Status](https://img.shields.io/docker/build/zotoio/github-task-manager.svg)](https://hub.docker.com/r/zotoio/github-task-manager)

receive github hook, notify agent, receive task results, notify github (Unofficial)

<image align="right" height="160" width="160" src="https://storage.googleapis.com/github-bin/gtm-logo.svg">

## Aims
Create an asynchronous CI agnostic mechanism for running custom test stage gates for github pull requests.
- allow team leads to configure task sequences without leaving github
- allow developers to see output from tasks without leaving github
- trigger multiple jobs in parallel and indicate pending status on pr checks
- then add results for each back to pull request check/comments as they complete
- make extensible for other github event handling
- stateless and deployable to Kubernetes at scale

## Design

- Deploy two functions to lambda via serverless framework ('gtmGithubHook', 'gtmGithubResults')
- github PR open hook pointed at 'gtmGithubHook' lambda which adds event to a 'PendingQueue' SQS queue
- agent(s) watch SQS for new test execution jobs
- agent notifies 'ResultsQueue' SQS queue that a task has started (lambda updates github PR state)
- agent triggers CI PR build, deploy and tests (plugin for each CI type)
- agent formats and adds test results to 'ResultsQueue' SQS queue
- agent notifies SNS topic which triggers 'gtmGithubResults' lambda
- 'gtmGithubResults' lambda posts results to github pull request.

[![flow](https://storage.googleapis.com/github-bin/github-task-manager.png)]()

## Install
- clone this repo or `npm install --save github-task-manager`
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
|GTM_AWS_ACCESS_KEY_ID | aws key id - for agent only |
|GTM_AWS_SECRET_ACCESS_KEY | aws secret - for agent only |
|AWS_PROXY|URL of proxy to use for network requests. Optional|
|GTM_AGENT_PORT| defaults to 9091 |
|GTM_AGENT_AWS_ACCESS_KEY_ID|access key for agent|
|GTM_AGENT_AWS_SECRET_ACCESS_KEY|secret key for agent|
|GTM_JENKINS_USER|login for jenkins executor|
|GTM_JENKINS_URL|url executor uses to talk to jenkins|
|GTM_JENKINS_CSRF| is csrf enabled? true or false|
|GTM_TEAMCITY_USER|teamcity executor user|
|GTM_TEAMCITY_PASSCODE|teamcity executor passcode|
|GTM_TEAMCITY_URL|teamcity api url|
|GTM_DOCKER_IMAGE_WHITELIST| comma separated list of regex of allows docker images eg. alpine:*,bash:latest|
|GTM_DOCKER_IMAGE_WHITELIST_FILE|use an optional docker whitelist file .dockerImageWhitelistExample|
|GTM_DOCKER_COMMANDS_ALLOWED| default is false, set to true to enable docker executor|
|GTM_DOCKER_ALLOW_PULL| allow agent to pull from registry |
|GTM_DOCKER_DEFAULT_WORKER_IMAGE| for running ci tasks, default is `zotoio/gtm-worker:latest` |
|IAM_ENABLED|agent host uses IAM ?|
|LAUNCHDARKLY_API_TOKEN|token for launchdarkly sass executor|
|GTM_LOGSTASH_HOST|optional logstash host for elasticsearch analysis|
|GTM_LOGSTASH_PORT|optional logstash port|
|GTM_SONAR_HOST_URL| sonar host url to connect to |
|GTM_SONAR_LOGIN| sonar access token |
|GTM_SONAR_PROJECTNAME_PREFIX| prefix if reporting to sonarqube |
|GTM_SONAR_ANALYSIS_MODE| mode for sonar runner, default preview for PRs |
|GTM_SONAR_GITHUB_OAUTH| github token for sonar to post comments and status |
|GTM_SONAR_SOURCES| default source dir is `src`|
|GTM_SONAR_JAVA_BINARIES| default is `target`|
|GTM_SONAR_MODULES| comma separated modules|
|GTM_SONAR_GITHUB_ENDPOINT| optional enterprise github api url|
|GTM_TASK_CONFIG_DEFAULT_URL| url to default sample config used when repo is missing .githubTaskManager.json|
|GTM_TASK_CONFIG_DEFAULT_MESSAGE_PATH| path to markdown comment file added to PRs when repo is missing .githubTaskManager.json|


## Configure and deploy
- run: `npm run sls-deploy` - note that this will create aws re$ources..
- capture the hook url output in console and add to github repo pull request conf
- run: `npm run sls-logs-hook` or `npm run sls-logs-results` to tail the logs
- create a .githubTaskManager.json in your repo per https://github.com/zotoio/github-task-manager/wiki/Creating-a-Task-Configuration
- start an agent locally using `npm run build && npm start agent` (or use docker/k8s)
- create a pull request and confirm the hook is being hit and agent processes event

## Docker and Kubernetes agents
You can run the latest image from docker hub: https://hub.docker.com/r/zotoio/github-task-manager
```
npm run docker-hub-run
```
..or run using the local checkout and tail logs:
```
npm run docker-local-bounce
```
..or if you have a k8s cluster and kubectl configured:
```
npm run k8s-apply
npm run k8s-delete
```
note that these k8s npm script inject vars from .env into the manifest

[![k8s](https://storage.googleapis.com/github-bin/agent-k8s.png)]()

a starting point k8s manifest is in ./k8s/k8s-gtm-agent.yml

## Agent Configuration

### Running the Agent
The agent uses environment variables to configure itself as well as any executors running within it. The below environment variables are required for basic operation of the GTM Agent.

TODO: Provide Variables

### Agent Homepage
The GTM Agent provides an information page summarising the ongoing operation of the agent. The page is available on port 9091 by default.

<image src="gtm-agent-homepage.png">

## Plugins
Task executors for Jenkins, Teamcity, Travis, Http, Docker are in progress. Custom task executors can be added by adding this project as a dependency, and registering new Executors and EventHandlers.  Please see https://github.com/zotoio/gtm-agent for an example that you can fork and modify as required while still using this project as the core.

- Executors contain the logic to run tasks against a given system type, and format the results.
- EventHandlers are used to map Github events to specific functionality such as pull requests.

## Contributing

Fork this repository and work on your enhancements, then send a pull request.  If you build custom plugins that may be useful to others in your forked gtm-agent, please let us know and may be able to assist wwith backporting to this project.

Use commitizen for conventional commit messages via `git cz` instead of `git commit`.  
To setup if not already installed:
```
npm install -g commitizen
npm install -g cz-conventional-changelog
echo '{ "path": "cz-conventional-changelog" }' > ~/.czrc
```
..or you can just use `npm run commit` which will use local commitizen install..

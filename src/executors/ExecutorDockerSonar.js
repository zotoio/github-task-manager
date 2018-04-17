import { Executor } from '../agent/Executor';
import { ExecutorDocker } from './ExecutorDocker';
import { default as _ } from 'lodash';
import { AgentUtils } from '../agent/AgentUtils';

/**
 * Sample .githubTaskManager.json task config
 *
 * see: https://github.com/zotoio/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
{
  "pull_request": {
    "agentGroup": "K8S",
    "tasks": [
      {
        "executor": "DockerSonar",
        "context": "Scan PR",
        "options": {
           "env": {"BUILD_TYPE": "nodejs"}
        }
      }
    ]
  }
}

 *
 */

export class ExecutorDockerSonar extends ExecutorDocker {
    constructor(eventData, log) {
        super(eventData, log);
        this.eventData = eventData;
        this.log = log;
    }

    async executeTask(task) {
        task.options = this.mergeTaskOptions(task);
        return super.executeTask(task);
    }

    mergeTaskOptions(task) {
        let options = {
            image: process.env.GTM_DOCKER_DEFAULT_WORKER_IMAGE || 'zotoio/gtm-worker:latest',
            command: '/usr/workspace/sonar-pullrequest.sh',
            env: {
                GIT_CLONE: '##GH_CLONE_URL##',
                GIT_PR_ID: '##GHPRNUM##',
                GIT_PR_BRANCHNAME: '##GH_PR_BRANCHNAME##',
                SONAR_GITHUB_REPOSITORY: '##GH_REPOSITORY_FULLNAME##',
                SONAR_HOST_URL: '##GTM_SONAR_HOST_URL##',
                SONAR_LOGIN: '##GTM_SONAR_LOGIN##',
                SONAR_PROJECTNAME_PREFIX: '##GTM_SONAR_PROJECTNAME_PREFIX##',
                SONAR_ANALYSIS_MODE: '##GTM_SONAR_ANALYSIS_MODE##',
                SONAR_GITHUB_OAUTH: '##GTM_SONAR_GITHUB_OAUTH##',
                SONAR_SOURCES: '##GTM_SONAR_SOURCES##',
                SONAR_JAVA_BINARIES: '##GTM_SONAR_JAVA_BINARIES##',
                SONAR_MODULES: '##GTM_SONAR_MODULES##',
                SONAR_GITHUB_ENDPOINT: '##GTM_SONAR_GITHUB_ENDPOINT##',
                S3_DEPENDENCY_BUCKET: '##GTM_S3_DEPENDENCY_BUCKET##'
            },
            validator: {
                type: 'outputRegex',
                regex: '.*ANALYSIS SUCCESSFUL.*'
            }
        };

        // options defined above can be overidden by options in .githubTaskManager.json
        task.options = _.merge(options, task.options);

        task.options = AgentUtils.applyTransforms(
            AgentUtils.templateReplace(
                AgentUtils.createBasicTemplate(this.eventData, {}, this.log),
                task.options,
                this.log
            )
        );

        // add token into clone url
        task.options.env.GIT_CLONE = task.options.env.GIT_CLONE.replace(
            'https://',
            `https://${task.options.env.SONAR_GITHUB_OAUTH}@`
        );

        return task.options;
    }
}

Executor.register('DockerSonar', ExecutorDockerSonar);

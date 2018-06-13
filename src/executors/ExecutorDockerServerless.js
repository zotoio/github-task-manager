import { Executor } from '../agent/Executor';
import { ExecutorDocker } from './ExecutorDocker';
import { default as _ } from 'lodash';
import { AgentUtils } from '../agent/AgentUtils';
import KmsUtils from '../KmsUtils';

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
        "executor": "DockerServerless",
        "context": "Deploy Lambda",
        "options": {
           "env": {"BUILD_TYPE": "nodejs"}
        }
      }
    ]
  }
}

 *
 */

export class ExecutorDockerServerless extends ExecutorDocker {
    constructor(eventData, log) {
        super(eventData, log);
        this.eventData = eventData;
        this.log = log;
        this.packagesToDeploy = this.identifyChangedPackages();
        this.refParts = this.eventData.ref ? this.eventData.ref.split('/') : [];
        this.pushBranch = this.refParts.length > 0 ? this.refParts[this.refParts.length] : null;
    }

    async executeTask(task) {
        task.options = this.mergeTaskOptions(task);
        return super.executeTask(task);
    }

    identifyChangedPackages() {
        let packages = [];
        this.eventData.commits.forEach(commit => {
            ['added', 'removed', 'modified'].forEach(changeType => {
                commit[changeType].forEach(path => {
                    if (path.startsWith('packages/')) {
                        let pack = path.split('/')[1];
                        if (!packages.includes(pack)) {
                            packages.push(pack);
                        }
                    }
                });
            });
        });
        this.log.info(`serverless packages to deploy ${packages}`);

        return packages;
    }

    mergeTaskOptions(task) {
        let options = {
            image: process.env.GTM_DOCKER_DEFAULT_WORKER_IMAGE || 'zotoio/gtm-worker:latest',
            command: '/usr/workspace/serverless-mono-deploy.sh',
            env: {
                GIT_CLONE: '##GH_CLONE_URL##',
                GIT_PR_ID: '##GHPRNUM##',
                GIT_PR_BRANCHNAME: '##GH_PR_BRANCHNAME##',
                GIT_PUSH_BRANCHNAME: this.pushBranch,
                SLS_AFFECTED_PACKAGES: this.packagesToDeploy.join(','),
                IAM_ENABLED: process.env.IAM_ENABLED,
                S3_DEPENDENCY_BUCKET: '##GTM_S3_DEPENDENCY_BUCKET##',
                AWS_S3_PROXY: '##GTM_AWS_S3_PROXY##',
                AWS_STAGE: process.env.GTM_AWS_STAGE,
                AWS_REGION: process.env.GTM_AWS_REGION
            },
            validator: {
                type: 'outputRegex',
                regex: '.*ALL DEPLOYS SUCCESSFUL.*'
            }
        };

        if (!process.env.IAM_ENABLED) {
            options.env['GTM_AWS_ACCESS_KEY_ID'] = KmsUtils.getDecrypted(process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID);
            options.env['GTM_AWS_SECRET_ACCESS_KEY'] = KmsUtils.getDecrypted(
                process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY
            );
            options.env['GTM_AWS_REGION'] = process.env.GTM_AWS_REGION;
        }

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
            `https://${task.options.env.GTM_CRYPT_GITHUB_TOKEN}@`
        );

        return task.options;
    }
}

Executor.register('DockerServerless', ExecutorDockerServerless);

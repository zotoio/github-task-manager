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
        this._packagesToDeploy = this.identifyChangedPackages();
        this.pushBranch = this.pushBranchName();
    }
    get packagesToDeploy() {
        return this._packagesToDeploy;
    }

    async executeTask(task) {
        task.options = await this.mergeTaskOptions(task);
        return super.executeTask(task);
    }
    pushBranchName() {
        let refParts = this.eventData.ref ? this.eventData.ref.split('/') : [];
        let branchName = refParts.length > 0 ? refParts[refParts.length - 1].replace(/[^A-Za-z0-9\-+_]/g, '-') : null;
        this.log.info(`pushBranchName: ${branchName}`);
        return branchName;
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
    slsStage() {
        let stage = process.env.GTM_SLS_EXECUTOR_AWS_STAGE || this.eventData.pushForPullRequest ? 'test' : 'dev';
        this.log.info(`stage: ${stage}`);
        return stage;
    }

    async mergeTaskOptions(task) {
        let options = {
            image: process.env.GTM_DOCKER_DEFAULT_WORKER_IMAGE || 'zotoio/gtm-worker:latest',
            command: '/usr/workspace/serverless-mono-deploy.sh',
            env: {
                GIT_CLONE: '##GH_CLONE_URL##',
                GIT_PR_ID: '##GHPRNUM##',
                GIT_PR_BRANCHNAME: '##GH_PR_BRANCHNAME##',
                GIT_PUSH_BRANCHNAME: this.pushBranch,
                GIT_URL: '##GIT_URL##',
                GIT_COMMIT: '##GIT_COMMIT##',
                GTM_EVENT_ID: this.eventData.ghEventId,
                SLS_AFFECTED_PACKAGES: this.packagesToDeploy.join(','),
                IAM_ENABLED: process.env.IAM_ENABLED,
                S3_DEPENDENCY_BUCKET: '##GTM_S3_DEPENDENCY_BUCKET##',
                AWS_S3_PROXY: '##GTM_AWS_S3_PROXY##',
                SLS_AWS_STAGE: this.slsStage(),
                SLS_AWS_REGION: process.env.GTM_SLS_EXECUTOR_AWS_REGION || 'ap-southeast-2',
                SLS_AWS_EXECUTION_ROLE: process.env.GTM_SLS_EXECUTOR_AWS_EXECUTION_ROLE,
                SLS_DEPLOY_MODE: process.env.GTM_SLS_EXECUTOR_DEPLOY_MODE || 'parallel'
            },
            validator: {
                type: 'outputRegex',
                regex: '.*ALL DEPLOYS SUCCESSFUL.*'
            }
        };

        if (!process.env.IAM_ENABLED) {
            options.env['GTM_AWS_ACCESS_KEY_ID'] = await KmsUtils.getDecrypted(
                process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID
            );
            options.env['GTM_AWS_SECRET_ACCESS_KEY'] = await KmsUtils.getDecrypted(
                process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY
            );
            options.env['GTM_AWS_REGION'] = process.env.GTM_AWS_REGION;
        }

        // options defined above can be overidden by options in .githubTaskManager.json
        task.options = _.merge(options, task.options);

        task.options = AgentUtils.applyTransforms(
            AgentUtils.templateReplace(
                await AgentUtils.createBasicTemplate(this.eventData, {}, this.log),
                task.options,
                this.log
            )
        );

        // add token into clone url
        if (process.env.GTM_CRYPT_GITHUB_TOKEN) {
            let decyptedToken = await KmsUtils.decrypt(process.env.GTM_CRYPT_GITHUB_TOKEN);
            task.options.env.GIT_CLONE = task.options.env.GIT_CLONE.replace('https://', `https://${decyptedToken}@`);
        }

        return task.options;
    }
}

Executor.register('DockerServerless', ExecutorDockerServerless);

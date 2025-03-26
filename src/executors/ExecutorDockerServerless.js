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
        let ref = this.eventData.ref;
        this.log.info(`pushBranchName: ${ref}`);
        return ref;
    }

    identifyChangedPackages() {
        let packages = [];
        this.eventData.commits.forEach((commit) => {
            ['added', 'removed', 'modified'].forEach((changeType) => {
                commit[changeType].forEach((path) => {
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
        let stage = this.eventData.pushForPullRequest ? 'test' : 'dev';
        // allow global override
        if (process.env.GTM_SLS_EXECUTOR_AWS_STAGE) {
            stage = process.env.GTM_SLS_EXECUTOR_AWS_STAGE;
        }
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
                SLS_DEPLOY_MODE: process.env.GTM_SLS_EXECUTOR_DEPLOY_MODE || 'parallel',
                SLS_APIGW_ENDPOINT_TYPE: process.env.GTM_SLS_EXECUTOR_APIGW_ENDPOINT_TYPE,
                SLS_APIGW_DOMAIN_SUFFIX: process.env.GTM_SLS_EXECUTOR_APIGW_DOMAIN_SUFFIX,
                SLS_DEPLOYMENT_S3_BUCKET_PREFIX: process.env.GTM_SLS_EXECUTOR_DEPLOYMENT_S3_BUCKET_PREFIX,
                SLS_SNS_ERROR_TOPIC_ARN: process.env.GTM_SLS_EXECUTOR_SNS_ERROR_TOPIC_ARN,
                SLS_HTTP_PROXY: process.env.GTM_SLS_EXECUTOR_HTTP_PROXY,
                SLS_NO_PROXY: process.env.GTM_SLS_EXECUTOR_NO_PROXY,
                SLS_VPC_ID: process.env.GTM_SLS_EXECUTOR_VPC_ID,
                SLS_VPC_SECURITY_GROUP_ID: process.env.GTM_SLS_EXECUTOR_VPC_SECURITY_GROUP_ID,
                SLS_VPC_SUBNET_A: process.env.GTM_SLS_EXECUTOR_VPC_SUBNET_A,
                SLS_VPC_SUBNET_B: process.env.GTM_SLS_EXECUTOR_VPC_SUBNET_B,
                SLS_VPC_SUBNET_C: process.env.GTM_SLS_EXECUTOR_VPC_SUBNET_C,
                SLS_AWS_KMS_KEY_ID: process.env.GTM_SLS_EXECUTOR_AWS_KMS_KEY_ID,
                SLS_CONFIG_TYPE: process.env.GTM_SLS_EXECUTOR_CONFIG_TYPE,
                SLS_SPRING_CONFIG_ENDPOINT: process.env.GTM_SLS_EXECUTOR_SPRING_CONFIG_ENDPOINT,
                GTM_WORKER_SCRIPTS_CLONE: process.env.GTM_WORKER_SCRIPTS_CLONE,
                GTM_WORKER_SCRIPTS_PATH: process.env.GTM_WORKER_SCRIPTS_PATH,
            },
            validator: {
                type: 'outputRegex',
                regex: '.*ALL DEPLOYS SUCCESSFUL.*',
            },
        };

        if (!process.env.IAM_ENABLED) {
            options.env['GTM_AWS_ACCESS_KEY_ID'] = await KmsUtils.getDecrypted(
                process.env.GTM_CRYPT_AGENT_AWS_ACCESS_KEY_ID,
            );
            options.env['GTM_AWS_SECRET_ACCESS_KEY'] = await KmsUtils.getDecrypted(
                process.env.GTM_CRYPT_AGENT_AWS_SECRET_ACCESS_KEY,
            );
            options.env['GTM_AWS_REGION'] = process.env.GTM_AWS_REGION;
        }

        // options defined above can be overidden by options in .githubTaskManager.json
        task.options = _.merge(options, task.options);

        task.options = AgentUtils.applyTransforms(
            AgentUtils.templateReplace(
                await AgentUtils.createBasicTemplate(this.eventData, {}, this.log),
                task.options,
                this.log,
            ),
        );

        // add token into clone url
        if (process.env.GTM_CRYPT_GITHUB_TOKEN) {
            let decyptedToken = await KmsUtils.decrypt(process.env.GTM_CRYPT_GITHUB_TOKEN);
            task.options.env.GIT_CLONE = task.options.env.GIT_CLONE.replace('https://', `https://${decyptedToken}@`);
            task.options.env.GTM_WORKER_SCRIPTS_CLONE = task.options.env.GTM_WORKER_SCRIPTS_CLONE.replace(
                'https://',
                `https://${decyptedToken}@`,
            );
        }

        return task.options;
    }
}

Executor.register('DockerServerless', ExecutorDockerServerless);

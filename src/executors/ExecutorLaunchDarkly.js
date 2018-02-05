import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';
import { LaunchDarklyUtils } from 'launchdarkly-nodeutils';
import { default as formatJson } from 'format-json';

let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
 *
 * see: https://github.com/wyvern8/github-task-manager/wiki/Structure-of-.githubTaskManager.json
 *
 * {
        "executor": "LaunchDarkly",
        "context": "Set FeatureFlags",
        "options": {
          "project": "mlc",
          "environment": "dev",
          "flags": {
            "testFlagOne": true,
            "testFlagTwo": false
          }
        }
      }
 */

export class ExecutorLaunchDarkly extends Executor {
    constructor(eventData) {
        super(eventData);
        this.options = this.getOptions();
    }

    async getLDUtils() {
        if (!this.ldUtils) {
            let that = this;
            return new LaunchDarklyUtils().create(process.env.LAUNCHDARKLY_API_TOKEN, log).then(handle => {
                that.ldUtils = handle;
                return Promise.resolve(handle);
            });
        } else {
            return Promise.resolve(this.ldUtils);
        }
    }

    async getFlagValue(task, flagName) {
        log.info(`Getting Flag Value for Flag '${flagName}'`);
        return this.getLDUtils().then(ldUtils => {
            return ldUtils.getFeatureFlagState(task.options.project, flagName, task.options.environment);
        });
    }

    async setFlagValue(task, flagName, flagValue) {
        log.info(`Setting Flag '${flagName}' to '${flagValue}'`);
        let oldFlagValue = await this.getFlagValue(task, flagName);
        let changed = false;

        if (oldFlagValue !== flagValue) {
            // Values are Different, Update Flag Value Using API
            log.info(`Updating Flag Value for '${flagName}'`);
            await this.getLDUtils().then(async ldUtils => {
                await ldUtils.toggleFeatureFlag(task.options.project, flagName, task.options.environment, flagValue);
            });
            changed = true;
        } else {
            // Values are the Same, no Update Needed
            log.info(`Skipping Update for Flag '${flagName}'`);
        }

        return {
            flagName: flagName,
            newValue: flagValue,
            oldValue: oldFlagValue,
            changed: changed
        };
    }

    async executeTask(task) {
        let flags = task.options.flags;
        let results = [];
        let changedCount = 0;
        let details = '';

        log.info(`Starting LaunchDarkly api calls. Flags: ${formatJson.plain(flags)}`);
        try {
            for (let flagName in flags) {
                let result = await this.setFlagValue(task, flagName, flags[flagName]);
                results.push(result);

                if (result.changed) {
                    details += `${flagName} = ${result.newValue} (was ${result.oldValue})<br>`;
                    changedCount++;
                } else {
                    details += `${flagName} = ${result.newValue} (no change)<br>`;
                }
            }
        } catch (e) {
            let resultSummary = {
                passed: false,
                url: 'https://github.com',
                message: `failed to set flags`,
                details: e.message
            };

            task.results = resultSummary;
            return Promise.reject(task);
        }

        let resultSummary = {
            passed: true,
            url: 'https://github.com',
            message: `Updated ${changedCount} Flags`,
            details: details
        };

        task.results = resultSummary;

        return Promise.resolve(task);
    }
}

Executor.register('LaunchDarkly', ExecutorLaunchDarkly);

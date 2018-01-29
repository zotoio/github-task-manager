import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';

let log = AgentUtils.logger();

/**
 * Sample .githubTaskManager.json task config
 * {
        "executor": "LaunchDarkly",
        "context": "Set FeatureFlags",
        "options": {
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

    async getFlagValue(flagName) {
        log.info(`Getting Flag Value for Flag '${flagName}'`);
        return true;
    }

    async setFlagValue(flagName, flagValue) {

        log.info(`Setting Flag '${flagName}' to '${flagValue}'`);
        let oldFlagValue = this.getFlagValue(flagName);
        let changed = false;

        if (oldFlagValue != flagValue) {
            // Values are Different, Update Flag Value Using API
            log.info(`Updating Flag Value for '${flagName}'`);
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
        let passed = true;

        log.info(`Starting LaunchDarkly api calls. Flags: ${flags}`);

        for (let flagName in flags) {
            let result = await this.setFlagValue(flagName, flags[flagName]);
            results.push(result);
            if (result.changed) { changedCount++; }
        }

        return {
            passed: passed,
            url: 'https://github.com',
            message: `Updated ${changedCount} Flags`
        };

    }
}

Executor.register('LaunchDarkly', ExecutorLaunchDarkly);

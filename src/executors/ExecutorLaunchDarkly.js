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

    async executeTask(task) {
        log.info(`Starting LaunchDarkly api calls. Flags: ${task.options.flags}`);

        //do it
    }
}

Executor.register('LaunchDarkly', ExecutorLaunchDarkly);

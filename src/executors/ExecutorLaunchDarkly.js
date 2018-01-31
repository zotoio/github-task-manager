import { Executor } from '../agent/Executor';
import { AgentUtils } from '../agent/AgentUtils';

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

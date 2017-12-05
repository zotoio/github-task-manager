import { EventHandler } from './agent/EventHandler';
import { Executor } from './agent/Executor';
import { Agent } from './agent/Agent';

module.exports.registerEventHandler = EventHandler.register;
module.exports.registerExecutor = Executor.register;
module.exports.startAgent = Agent.start;
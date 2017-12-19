'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';
import { AgentUtils } from './AgentUtils';
let json = require('format-json');
let log = AgentUtils.logger();

/**
 * Create an Executor to run Builds, Deploys, and Tests
 */
export class Executor extends Plugin {
    /**
     * Initialise the CI Executor
     * @param {String} executorType - Class Name to Create
     * @param {*} eventData - Object of Options to pass into Class
     */
    constructor(eventData) {
        super();

        // executors must register functions for event types
        //this.run = [];

        this.eventId = eventData.ghEventId;
        this.eventType = eventData.ghEventType;
        this.taskConfig = eventData.ghTaskConfig;
        this.eventData = eventData;

        log.info('----------------------------');
        log.info(`New Executor Created`);
        log.info('Event ID: ' + this.eventId);
        log.info('Event Type: ' + this.eventType);
        log.info('----------------------------');
        log.debug('Task Config: ' + json.plain(this.taskConfig));
        log.debug(eventData);
    }

    /**
     * default implementation just returns env vars
     * @returns options specific to executor type
     */
    getOptions() {
        return process.env;
    }

    async executeTask() {
        // Override in Implementation
        // This will need to be a promise so we can chain and get results back
    }
}

requireDir('../executors');

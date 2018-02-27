'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';
let json = require('format-json');

/**
 * Create an Executor to run Builds, Deploys, and Tests
 */
export class Executor extends Plugin {
    /**
     * Initialise the CI Executor
     * @param {String} executorType - Class Name to Create
     * @param {*} eventData - Object of Options to pass into Class
     * @param {Logger} log - child logger for event
     */
    constructor(eventData, log) {
        super();
        this.log = log;

        this.eventId = eventData.ghEventId;
        this.eventType = eventData.ghEventType;
        this.taskConfig = eventData.ghTaskConfig;
        this.eventData = eventData;

        this.log.info('----------------------------');
        this.log.info(`New Executor Created`);
        this.log.info('Event ID: ' + this.eventId);
        this.log.info('Event Type: ' + this.eventType);
        this.log.info('----------------------------');
        this.log.debug('Task Config: ' + json.plain(this.taskConfig));
        this.log.debug(eventData);
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

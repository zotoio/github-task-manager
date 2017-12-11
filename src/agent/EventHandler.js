'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';
import { Utils } from './AgentUtils';
import { default as json } from 'format-json';
let log = Utils.logger();

export class EventHandler extends Plugin {

    constructor(eventData) {
        super();

        log.info(`incoming event: ${json.plain(eventData)}`);

        this.eventId = eventData.ghEventId;
        this.eventType = eventData.ghEventType;
        this.taskConfig = eventData.ghTaskConfig;
        this.eventData = eventData;

        // Handle Older Task Format
        try {
            this.tasks = this.taskConfig[this.eventType].tasks;
        } catch(error) {
            log.error('No Tasks Defined for Event Type ' + this.eventType);
            log.debug(error);
            this.tasks = {};
        }

        log.info('----------------------------');
        log.info('New Event Received');
        log.info('Event ID: ' + this.eventId);
        log.info('Event Type: ' + this.eventType);
        log.info('Tasks: ' + json.plain(this.tasks));
        log.debug(eventData);

    }

}

requireDir('../handlers');
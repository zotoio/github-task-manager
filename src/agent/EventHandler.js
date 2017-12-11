'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';
import { Utils } from './AgentUtils';
import { default as json } from 'format-json';
let log = Utils.logger();

export class EventHandler extends Plugin {

    constructor(eventData) {
        super();

        log.info(`incoming event: ${eventData}`);

        this.eventId = eventData.ghEventId;
        this.eventType = eventData.ghEventType;
        this.taskConfig = eventData.ghTaskConfig;
        this.eventData = eventData;
        this.tasks = this.taskConfig[this.eventType].tasks;

        log.info('----------------------------');
        log.info('New Event received');
        log.info('Event Id: ' + this.eventId);
        log.info('Event Type: ' + this.eventType);
        log.info('Tasks: ' + json.plain(this.tasks));
        log.debug(eventData);

    }

}

requireDir('../handlers');
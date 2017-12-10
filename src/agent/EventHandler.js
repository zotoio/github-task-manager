'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';
import { Utils } from './AgentUtils';
let json = require('format-json');
let log = Utils.logger();

export class EventHandler extends Plugin {

    constructor(eventData) {
        super();

        this.eventId = eventData.ghEventId;
        this.eventType = eventData.ghEventType;
        this.taskConfig = eventData.ghTaskConfig;
        this.eventData = eventData;
        this.tasks = this.taskConfig[this.eventType].tasks;

        log.info('----------------------------');
        log.info('New Event received');
        log.info('Event Id: ' + this.eventId);
        log.info('Event Type: ' + this.eventType);
        log.info('Task Config: ' + json.plain(this.taskConfig));
        log.debug(eventData);

    }

}

requireDir('../handlers');
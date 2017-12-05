'use strict';
import requireDir from 'require-dir';
import { Plugin } from './Plugin';

export class EventHandler extends Plugin {

    constructor(eventType, userCallback = null) {
        super();
        this.eventType = eventType;
        this.userCallback = userCallback;
    }

    info() {
        return 'Handles: \'' + this.eventType + '\'';
    }

}

requireDir('../handlers');
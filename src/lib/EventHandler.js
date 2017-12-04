'use strict';
import { SelfRegisteringSubClass } from '../lib/SelfRegisteringSubClass';

export class EventHandler extends SelfRegisteringSubClass {

    constructor(eventType, userCallback = null) {
        this.eventType = eventType;
        this.userCallback = userCallback;
    }

    info() {
        return 'Handles: \'' + this.eventType + '\'';
    }

}

requireDir('../handlers');
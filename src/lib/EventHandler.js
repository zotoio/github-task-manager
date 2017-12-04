'use strict';
import requireDir from 'require-dir';
import { SelfRegisteringSubClass } from '../lib/SelfRegisteringSubClass';

export class EventHandler extends SelfRegisteringSubClass {

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
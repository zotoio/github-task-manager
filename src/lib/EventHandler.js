'use strict';

export class EventHandler {

    constructor(eventType, userCallback = null) {
        this.eventType = eventType;
        this.userCallback = userCallback;
    }

    info() {
        return 'Handles: \'' + this.eventType + '\'';
    }

    handleEvent(event) {
        // Do something internal before calling the user callback.
        if (event.ghEventType !== this.eventType)
            return false;
        if (this.userCallback)
            this.userCallback(event);
        return true;
    }
}
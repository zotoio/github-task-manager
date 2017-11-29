export class EventHandler {

    constructor(eventType, userCallback = null) {
        this.eventType = eventType;
        this.userCallback = userCallback;
    }

    handleEvent(event) {
        // Do something internal before calling the user callback.
        if (event.eventType != this.eventType)
            return false;
        if (this.userCallback)
            this.userCallback(event);
        return true;
    }
} 
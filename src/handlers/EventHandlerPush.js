import { EventHandler } from '../agent/EventHandler';

export class EventHandlerPush extends EventHandler {
    // placeholder to override functions in EventHandler for this type
    getEventUrl() {
        return this.eventData.compare;
    }
    getEventUser() {
        return this.eventData.pusher.name;
    }
    getEventHeadSha() {
        return this.eventData.head_commit.id;
    }
}

EventHandler.register('push', EventHandlerPush);

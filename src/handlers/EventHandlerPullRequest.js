import { EventHandler } from '../agent/EventHandler';

export class EventHandlerPullRequest extends EventHandler {
    // placeholder to override functions in EventHandler for this type
    getEventUrl() {
        return this.eventData.pull_request.html_url;
    }
    getEventUser() {
        return this.eventData.pull_request.user.login;
    }
    getEventHeadSha() {
        return this.eventData.pull_request.head.sha;
    }
}

EventHandler.register('pull_request', EventHandlerPullRequest);

'use strict';
import requireDir from 'require-dir';

export class HandlerStore {

    constructor() {
        return this;
    }

    static get handlers() {
        if (this._handlers) {
            return this._handlers;
        } else {
            this._handlers = [];
            return this._handlers;
        }
    }

    static addHandler(handler) {
        let handlerLocation = this.handlers.indexOf(handler);
        if (handlerLocation != -1) {
            console.log('Handler already exists in Handler Store: ' + handler.eventType);
            return false;
        } else {
            this.handlers.push(handler);
            console.log('Registered Handler: ' + handler.eventType);
            return true;
        }
    }

    static removeHandler(removeHandler) {
        let handlerLocation = this.handlers.indexOf(removeHandler);
        if (handlerLocation != -1) {
            this.handlers.splice( handlerLocation, 1 );
        } else
            console.log('No Items Matched Provided Event Handler');
    }

    static handleEvent(event) {
        let eventHandled = false;
        if(this.handlers.length == 0) {
            console.log('No Handlers in Store');
            return false;
        }
        for(const handler of this.handlers) {
            //console.log(handler.info());
            if (handler.handleEvent(event))
                eventHandled = true;
        }
        console.debug(event);
        return eventHandled;
    }
}

requireDir('../handlers');
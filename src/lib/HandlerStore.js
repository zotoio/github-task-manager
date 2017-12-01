export class HandlerStore {

    constructor() {
        this.handlers = [];
    }

    addHandler(handler) {
        this.handlers.push(handler);
    }

    removeHandler(removeHandler) {
        let handlerLocation = this.handlers.indexOf(removeHandler);
        if (handlerLocation != -1)
            this.handlers.splice( handlerLocation, 1 );
        else
            console.log('No Items Matched Provided Event Handler');
    }

    handleEvent(event) {
        let eventHandled = false;
        if(this.handlers.length == 0) {
            console.log('No Handlers in Store');
            return false;
        }
        for(const handler of this.handlers) {
            //console.log(handler.info());
            console.log(handler.handleEvent(event));
        }
        console.debug(event);
        return eventHandled;
    }
} 
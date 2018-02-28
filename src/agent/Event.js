'use strict';

import 'babel-polyfill';
import { default as crypto } from 'crypto';
import { default as AgentLogger } from './AgentLogger';
import { Agent } from './Agent';

let log = AgentLogger.log();

/**
 * representation of an event generated from a github hook SQS message
 */
export class Event {
    constructor(message) {
        this.attrs = Event.validateMessage(message);
        this.payload = Event.prepareEventPayload(message, this.attrs);
        this.log = log.child({ ghEventId: this.attrs.ghEventId });
        Agent.systemConfig.event.current = this.payload;
    }

    /**
     * list of required message attributes on SQS messages
     * @returns {[string,string,string,string,string]}
     */
    static get requiredAttributes() {
        return ['ghEventId', 'ghEventType', 'ghAgentGroup', 'ghTaskConfig', 'ghEventSignature'];
    }

    /**
     * verify message attributes exist and check signing
     * @param message
     * @returns {{}} result attribute object
     */
    static validateMessage(message) {
        let result = {};

        Event.requiredAttributes.forEach(attr => {
            try {
                result[attr] = message.MessageAttributes[attr].StringValue;
            } catch (TypeError) {
                throw new Error(`No Message Attribute '${attr}' in Message - discarding Event!`);
            }
        });

        if (!Event.checkEventSignature(result.ghEventSignature, message)) {
            throw new Error('Event signature mismatch - discarding Event!');
        } else {
            log.info('Event signature verified. processing event..');
        }

        return result;
    }

    /**
     * sign the event message, and check that github signature matches
     * @param signature
     * @param message
     * @returns {boolean}
     */
    static checkEventSignature(signature, message) {
        let checkEvent = Event.buildCheckObject(message);
        log.debug(`eventString for signature check: ${JSON.stringify(checkEvent)}`);

        let calculatedSig = `sha1=${crypto
            .createHmac('sha1', process.env.GTM_GITHUB_WEBHOOK_SECRET)
            .update(JSON.stringify(checkEvent), 'utf-8')
            .digest('hex')}`;

        if (calculatedSig !== signature) {
            throw new Error(`signature mismatch: ${calculatedSig} !== ${signature}`);
        }

        return calculatedSig === signature;
    }

    static buildCheckObject(message) {
        return {
            id: message.MessageAttributes.ghEventId.StringValue,
            body: message.Body,
            messageAttributes: {
                ghEventId: {
                    DataType: 'String',
                    StringValue: message.MessageAttributes.ghEventId.StringValue
                },
                ghEventType: {
                    DataType: 'String',
                    StringValue: message.MessageAttributes.ghEventType.StringValue
                },
                ghTaskConfig: {
                    DataType: 'String',
                    StringValue: message.MessageAttributes.ghTaskConfig.StringValue
                },
                ghAgentGroup: {
                    DataType: 'String',
                    StringValue: message.MessageAttributes.ghAgentGroup.StringValue
                }
            }
        };
    }

    /**
     * create eventData object from message body, and attach message attributes
     * @param message
     * @param attrs
     */
    static prepareEventPayload(message, attrs) {
        let payload = JSON.parse(message.Body);
        payload.ghEventId = attrs.ghEventId;
        payload.ghEventType = attrs.ghEventType;
        payload.ghTaskConfig = JSON.parse(attrs.ghTaskConfig);
        payload.ghAgentGroup = attrs.ghAgentGroup;
        payload.ghEventSignature = attrs.ghEventSignature;
        payload.MessageHandle = message.ReceiptHandle;

        return payload;
    }
}

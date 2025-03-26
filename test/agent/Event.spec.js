import { default as fs } from 'fs';
import { describe, it, beforeEach, before, after } from 'mocha';
import { default as assert } from 'assert';
import { Event } from '../../src/agent/Event';

describe('Event', function () {
    let temp;
    before(() => {
        temp = process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET;
        process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET = 'squirrel';
    });

    after(() => {
        process.env.GTM_CRYPT_GITHUB_WEBHOOK_SECRET = temp;
    });

    let message;
    beforeEach(() => {
        process.env.GTM_AWS_KMS_KEY_ID = '';
        message = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubMessage.json', 'utf-8'));
    });

    describe('requiredAttributes', function () {
        it('should contain expected values', function () {
            let expected = ['ghEventId', 'ghEventType', 'ghAgentGroup', 'ghTaskConfig', 'ghEventSignature'];

            let actual = Event.requiredAttributes;

            for (let i = 1; i < 5; i++) {
                assert.equal(actual[i], expected[i]);
            }
        });
    });

    describe('validateMessage', function () {
        beforeEach(() => {
            message = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubMessage.json', 'utf-8'));
        });

        it('should throw when message has missing attribute', async function () {
            try {
                delete message.MessageAttributes.ghEventId;
                await Event.validateMessage(message);
            } catch (e) {
                assert.equal(e.message, `No Message Attribute 'ghEventId' in Message - discarding Event!`);
            }
        });

        it('should return message attributes', async function () {
            let expected = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubEventAttributes.json', 'utf-8'));

            let actual = await Event.validateMessage(message);

            assert.equal(JSON.stringify(actual), JSON.stringify(expected));
        });
    });

    describe('checkEventSignature', function () {
        it('should sign message with github webhook secret', async function () {
            let signature = message.MessageAttributes.ghEventSignature.StringValue;
            let result = await Event.checkEventSignature(signature, message);

            assert.equal(result, true);
        });
    });

    describe('buildCheckObject', function () {
        it('should create the expected check object from message', function () {
            let expected = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubMessageCheck.json', 'utf-8'));

            let actual = Event.buildCheckObject(message);

            assert.equal(JSON.stringify(actual), JSON.stringify(expected));
        });
    });

    describe('prepareEventPayload', function () {
        it('should create the expected payload from message and attributes', async function () {
            let expected = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubEventPayload.json', 'utf-8'));

            let attrs = await Event.validateMessage(message);
            let actual = Event.prepareEventPayload(message, attrs);

            assert.equal(JSON.stringify(actual), JSON.stringify(expected));
        });
    });
});

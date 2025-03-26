import { default as fs } from 'fs';
import { describe, it, beforeEach } from 'mocha';
import { default as assert } from 'assert';
import { Plugin } from '../../src/agent/Plugin';
import { EventHandler } from '../../src/agent/EventHandler';

describe('EventHandler', function () {
    let handler;
    beforeEach(() => {
        process.env.GTM_AWS_KMS_KEY_ID = '';
        let eventData = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/githubEventPayload.json', 'utf-8'));
        handler = new EventHandler(eventData, console);
    });

    describe('constructor', function () {
        it('should instantiate as Plugin', function () {
            assert.equal(handler instanceof Plugin, true);
        });
    });
});

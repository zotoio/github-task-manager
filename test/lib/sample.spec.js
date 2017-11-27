import { default as assert } from 'assert';
import { describe, it } from 'mocha';
import { Sample } from '../../src/lib/sample.js';

describe('Sample', function() {
    describe('test', function () {
        it('should return expected string', function (done) {

            let expected = 'test';

            let actual = new Sample().test();
            assert.equal(actual, expected);
            done();

        });
    });

});
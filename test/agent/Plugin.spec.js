import { describe, it } from 'mocha';
import { default as assert } from 'assert';
import { Plugin } from '../../src/agent/Plugin';

describe('Plugin', function () {
    process.env.GTM_AWS_KMS_KEY_ID = '';
    describe('register', function () {
        it('should register new class', function () {
            class Animal extends Plugin {}
            class Dog extends Animal {}

            Animal.register('Dog', Dog);

            assert.equal(Animal.isRegistered('Dog'), true);
        });
    });

    describe('create', function () {
        it('should create new instance of class', function () {
            class Animal extends Plugin {}
            class Dog extends Animal {
                constructor(options) {
                    super();
                    this.options = options;
                }
                puppies() {
                    return this.options.puppies;
                }
            }

            Animal.register('Dog', Dog);

            let dalmation = Animal.create('Dog', { puppies: 101 });

            assert.equal(dalmation.puppies(), 101);
        });
    });
});

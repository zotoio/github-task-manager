import * as AWS from 'aws-sdk';

class KmsUtils {
    constructor() {
        this.KMS = new AWS.KMS({ region: process.env.GTM_AWS_REGION });
        this.primeStore();
        console.info('KmsUtils created');
    }

    get logger() {
        if (!this._logger) this._logger = console;
        return this._logger;
    }
    set logger(log) {
        if (log) this._logger = log;
    }

    get store() {
        if (!this._store) this._store = {};
        return this._store;
    }

    async decrypt(encrypted) {
        if (encrypted) {
            if (!process.env.GTM_AWS_KMS_KEY_ID) {
                this.logger.warn(`no encryption key configured, using raw values`);
                this.setDecrypted(encrypted, encrypted);
                return encrypted;
            } else {
                this.logger.info(`decrypting: ${encrypted}`);
                if (this.hasDecrypted(encrypted)) {
                    this.logger.info('returning stored decrypted value');
                    return this.getDecrypted(encrypted);
                }
                try {
                    return this.KMS.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') })
                        .promise()
                        .then(data => {
                            this.logger.info(`storing decrypted result.`);
                            let decrypted = data.Plaintext.toString();
                            this.setDecrypted(encrypted, decrypted);
                            return decrypted;
                        });
                } catch (e) {
                    this.logger.error(e);
                }
            }
        }
        //return result;
    }
    async primeStore() {
        this.logger.info(`priming decrypted var store`);
        let promises = [];
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GTM_CRYPT_')) {
                promises.push(this.decrypt(process.env[key]));
                this.logger.info(`decrypting value of ${key}`);
            }
        });
        return Promise.all(promises);
    }
    hasDecrypted(encrypted) {
        return Object.keys(this.store).includes(encrypted);
    }
    async getDecrypted(encrypted) {
        if (this.hasDecrypted(encrypted)) {
            return this.store[encrypted];
        } else {
            this.logger.info(`returning newly decrypted value`);
            return await this.decrypt(encrypted);
        }
    }
    setDecrypted(encrypted, decrypted) {
        this.store[encrypted] = decrypted;
    }
}

export default new KmsUtils();

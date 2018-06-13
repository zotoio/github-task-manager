import * as AWS from 'aws-sdk';
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: 'KmsUtils' });

class KmsUtils {
    constructor() {
        this.KMS = new AWS.KMS({ region: process.env.GTM_AWS_REGION });
        this.primeStore();
        log.info('KmsUtils created');
    }

    get store() {
        if (!this._store) this._store = {};
        return this._store;
    }

    async decrypt(encrypted) {
        if (encrypted) {
            if (!process.env.GTM_AWS_KMS_KEY_ID) {
                log.warn(`no encryption key configured, using raw values`);
                this.setDecrypted(encrypted, encrypted);
                return encrypted;
            } else {
                log.info(`decrypting: ${encrypted}`);
                if (this.hasDecrypted(encrypted)) {
                    log.info('returning stored decrypted value');
                    return this.getDecrypted(encrypted);
                }
                try {
                    return this.KMS.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') })
                        .promise()
                        .then(data => {
                            log.info(`storing decrypted result.`);
                            let decrypted = data.Plaintext.toString();
                            this.setDecrypted(encrypted, decrypted);
                            return decrypted;
                        });
                } catch (e) {
                    log.error(e);
                }
            }
        }
        //return result;
    }
    async primeStore() {
        log.info(`priming decrypted var store`);
        let promises = [];
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GTM_CRYPT_')) {
                promises.push(this.decrypt(process.env[key]));
                log.info(`decrypting value of ${key}`);
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
            log.info(`returning newly decrypted value`);
            return await this.decrypt(encrypted);
        }
    }
    setDecrypted(encrypted, decrypted) {
        this.store[encrypted] = decrypted;
    }
}

export default new KmsUtils();

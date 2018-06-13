import * as AWS from 'aws-sdk';
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: 'KmsUtils' });

let STORE = {};

const KMS = new AWS.KMS({ region: process.env.GTM_AWS_REGION });

export class KmsUtils {
    constructor() {
        log.info('KmsUtils created');
    }

    static getStore() {
        return STORE;
    }
    static decrypt(encrypted, callback) {
        let result = '';
        if (encrypted) {
            if (!process.env.GTM_AWS_KMS_KEY_ID) {
                log.warn(`no encryption key configured, using raw values`);
                KmsUtils.setDecrypted(encrypted, encrypted);
                callback(null, encrypted);
            } else {
                log.info(`decrypting: ${encrypted}`);
                if (KmsUtils.hasDecrypted(encrypted)) {
                    log.info('returning stored decrypted value');
                    callback(null, KmsUtils.getDecrypted(encrypted));
                }
                try {
                    KMS.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') })
                        .promise()
                        .then(data => {
                            log.info(`storing decrypted result.`);
                            KmsUtils.setDecrypted(encrypted, data.Plaintext);
                            return callback(null, data.Plaintext);
                        });
                } catch (e) {
                    log.error(e);
                    return callback(e);
                }
            }
        }
        return result;
    }
    static primeStore() {
        log.info(`priming decrypted var store`);
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GTM_CRYPT_')) {
                KmsUtils.decrypt(process.env[key], err => {
                    if (err) log.error(err);
                    log.info(`stored decrypted value of ${key}`);
                });
            }
        });
    }
    static hasDecrypted(encrypted) {
        return Object.keys(STORE).includes(encrypted);
    }
    static getDecrypted(encrypted) {
        if (this.hasDecrypted(encrypted)) {
            return STORE[encrypted];
        } else {
            KmsUtils.decrypt(encrypted, (err, decrypted) => {
                if (err) log.error(err);
                log.warn(`returning newly decrypted value`);
                return decrypted;
            });
        }
    }
    static setDecrypted(encrypted, decrypted) {
        STORE[encrypted] = decrypted;
    }
}
KmsUtils.primeStore();

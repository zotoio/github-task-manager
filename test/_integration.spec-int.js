import { before } from 'mocha';

let integrationUrlPrefix = 'https://localhost';
let integrationConfig = {
    testRepoName: 'gtm-test'
};

// trigger config build before describe blocks
before( (done) => {
    // placeholder

    done();
});

// todo use agent in supertest instead
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

module.exports.urlPrefix = integrationUrlPrefix;
module.exports.config = integrationConfig;


'use strict';

let json = require('format-json');
let Consumer = require('sqs-consumer');

function handle(event, context, callback) {

    /* eslint-disable */
    console.log('---------------------------------');
    console.log(`Github-Results: `);
    console.log('---------------------------------');
    console.log('Payload', json.plain(event));
    /* eslint-enable */

    const response = {
        statusCode: 200,
        body: JSON.stringify({
            input: event,
        }),
    };

    return callback(null, response);
}

module.exports = {
    "handle": handle
};

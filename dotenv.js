const dotenv = require('dotenv');
const config = dotenv.config();

if (config.error) {
    console.error(config.error);
}

//console.log(json.plain(_.extend(sharedConfig.parsed, localConfig.parsed)));

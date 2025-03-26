var sass = require('sass');
var fs = require('fs');

let file = './dist/src/agent/static/main';

console.log('rendering css..');
sass.render(
    {
        file: file + '.scss',
    },
    function (err, result) {
        if (err) throw err;
        let outputFile = file + '.css';
        fs.writeFileSync(outputFile, result.css, 'utf8');
    },
);

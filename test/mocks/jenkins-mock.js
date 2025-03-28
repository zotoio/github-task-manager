import { default as http } from 'http';

class JenkinsMock {
    constructor() {
        this.server = null;
        this.port = 8211;
    }

    start() {
        this.server = http.createServer((req, res) => {
            if (req.url.includes('/job/')) {
                if (req.method === 'POST') {
                    // Return queue number for build requests
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ queueId: 123 }));
                } else {
                    // Return build status for GET requests
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            result: 'SUCCESS',
                            url: `http://localhost:${this.port}/job/test/1`,
                            number: 1,
                            executable: {
                                number: 1,
                            },
                        }),
                    );
                }
            } else if (req.url.includes('/queue/')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify({
                        executable: {
                            number: 1,
                        },
                    }),
                );
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        this.server.listen(this.port);
        return this.server;
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

export default JenkinsMock;

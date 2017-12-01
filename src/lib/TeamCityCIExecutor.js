class TeamCityCIExecutor {

    constructor(options) {
        this.masterUrl = options.masterUrl || 'https://localhost:8080/';
        this.username = options.username || 'admin';
        this.password = options.password || 'pa55word';
        this.authToken = options.authToken || 'abcde12345';
    }

}
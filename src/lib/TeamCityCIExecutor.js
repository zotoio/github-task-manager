export class TeamCityCIExecutor {

    constructor(options) {
        this.masterUrl = options ? options.masterUrl : 'https://localhost:8080/';
        this.username = options ? options.username : 'admin';
        this.password = options ? options.password : 'pa55word';
        this.authToken = options ? options.authToken : 'abcde12345';
    }

    info() {
        return 'TeamCity CI Executor';
    }

}
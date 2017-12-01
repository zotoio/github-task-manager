export class CIExecutorTeamCity {

    constructor(options) {
        this.masterUrl = options ? options.masterUrl : 'https://localhost:8080/';
        this.username = options ? options.username : 'admin';
        this.password = options ? options.password : 'pa55word';
        this.authToken = options ? options.authToken : 'abcde12345';
    }

    info() {
        return 'TeamCity CI Executor';
    }

    // Start Build Functions
    // All of these should return a chainable promise, so:
    // Jenkins.startBuildByName(buildName)
    //     .then(function(buildResults) {
    //
    //     });

    startBuildByName(buildName) {
        // Call the Job Build API
    }

    startBuildByRepo(buildRepo, buildBranch) {
        // Use the Jenkins Folder Format in Org Scans
    }

    startBuildByPullRequest(buildRepo, pullRequestNumber) {
        // Use the Jenkins Folder Format for PRs
    }

}
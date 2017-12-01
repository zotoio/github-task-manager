export class CIExecutorJenkins {

    constructor(options) {
        this.masterUrl = options ? options.masterUrl : 'https://localhost:8080/';
        this.username = options ? options.username : 'admin';
        this.password = options ? options.password : 'pa55word';
        this.authToken = options ? options.authToken : 'abcde12345';
    }

    info() {
        return 'Jenkins CI Executor';
    }

    // Start Build Functions
    // All of these should return a chainable promise, so:
    // Jenkins.startBuildByName(buildName)
    //     .then(function(buildResults) {
    //
    //     });

    startBuildByName(buildName) {
        // Call the Job Build API
        console.log(buildName);
    }

    startBuildByRepo(buildRepo, buildBranch) {
        // Use the Jenkins Folder Format in Org Scans
        console.log(buildRepo + ', ' + buildBranch);
    }

    startBuildByPullRequest(buildRepo, pullRequestNumber) {
        // Use the Jenkins Folder Format for PRs
        console.log(buildRepo + ', ' + pullRequestNumber);
    }

}
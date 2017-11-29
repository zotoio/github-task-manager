export class CIExecutor {

    constructor(executorType, executorUrl, executorUsername, executorPassword) {
        this.executorType = executorType;
        this.executorUrl = executorUrl;
        this.executorUsername = executorUsername;
        this.executorPassword = executorPassword;
    }

    static get CI_JENKINS() { return 'CI_TYPE_JENKINS'; }
    static get CI_TEAMCITY() { return 'CI_TYPE_TEAMCITY'; }

}
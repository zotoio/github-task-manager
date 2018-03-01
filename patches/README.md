# temporary node module patches

files added here are overlayed on node_modules dir before build.  each patch should be short term, and documented here.

## current patches

1. **@octokit/rest 'get-request-agent.js'** patched to remove expression from require call. see https://github.com/octokit/rest.js/issues/774

1. **is-array-buffer 'is-array-buffer.esm.js'** Used by octokit, and incorrectly bundles es6 in webpack.  see https://github.com/octokit/rest.js/issues/774

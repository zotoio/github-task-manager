FROM node:8

WORKDIR /home/node/app

COPY ./package.json /home/node/app/package.json
COPY ./src /home/node/app/src
COPY ./test /home/node/app/test
COPY ./.eslintrc.json /home/node/app/.eslintrc.json
COPY ./.babelrc /home/node/app/.babelrc
COPY ./index.js /home/node/app/index.js

RUN cd /home/node/app && npm install --verbose && npm run agent-build

ENTRYPOINT ["npm", "run", "agent"]

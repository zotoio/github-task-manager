#!/bin/bash

# requires kubectl local env configured to your cluster - pass in 'create' or 'delete'

export $(cat .env | grep -v ^# | xargs) && envsubst < ./k8s/k8s-gtm-agent.yml | kubectl $1 -f -
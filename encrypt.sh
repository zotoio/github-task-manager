#!/bin/bash

display_usage() {
    echo "Please supply env var name and value to encrypt"
    echo "eg. ./encrypt.sh GTM_CRYPT_MY_VARIABLE supers3cret"
}

if [ $# -eq 0 ]; then
    display_usage
    exit 1
fi

export $(cat .env | grep -v ^# | xargs)
node ./node_modules/serverless/bin/serverless encrypt -k $GTM_AWS_KMS_KEY_ID -n $1 -v $2

# todo add encrypted values to .env from kms secrets
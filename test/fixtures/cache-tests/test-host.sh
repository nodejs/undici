#!/bin/bash

## Run tests against a host/port combination.

set -euo pipefail

function usage {
  if [[ -n "${1}" ]]; then
    echo "${1}"
  fi
  echo "Usage: ${0} [ -i test-id ] host[:port]"
}

function run {
  TEST_ID="$1"
  HOST="$2"
  if [[ -z $TEST_ID ]]; then
    npm run --silent cli --base="http://${HOST}"
  else
    npm run --silent cli --base="http://${HOST}" --id="${TEST_ID}"
  fi

}

TEST_ID=""
while getopts "h?i:" opt; do
  case "${opt}" in
    h)
      usage
      exit 0
      ;;
    i)
      TEST_ID=$OPTARG
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done
shift $((OPTIND-1))

if [[ $# -ne 1 ]]; then
  usage "Please specify a host:port."
  exit 1
fi

run "$TEST_ID" "$1"

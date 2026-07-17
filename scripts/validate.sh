#!/bin/bash
set -euo pipefail
cleanup() {
    if [ -f openapi.yaml.bck ]; then
        rm openapi.yaml
        mv openapi.yaml.bck openapi.yaml
    fi
}

trap cleanup EXIT
cp openapi.yaml openapi.yaml.bck

npm run build:openapi
npm run lint:validate
npm run lint:api
npm run validate:operation-ids

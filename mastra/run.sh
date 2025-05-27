#!/bin/bash -x

[ ! -d '/tmp/cache' ] && mkdir -p /tmp/cache

exec node .mastra/output/index.mjs
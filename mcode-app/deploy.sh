#!/usr/bin/env sh

# 当发生错误时中止脚本
set -e

# 构建

# 部署
scp -r dist/build/h5/* root@jiangruyi.com:/home/ly/www/mcode/$1

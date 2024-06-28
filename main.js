'use strict';

const { log, postBuildCompressConfig } = require('./utils');
const { postBulildCompress } = require('./post_build_compres');

function onBuildStart (options, callback) {
  log('=====Build Start====', options);
  callback();
}


async function onBuildFinish(options, callback) {
  log('=====Build Finished====', options);
  if(postBuildCompressConfig) {
    await postBulildCompress(options);
  }
  callback();
}


module.exports = {
  load () {
    log('=====压缩插件加载成功====');
    Editor.Builder.on('build-start', onBuildStart);
    Editor.Builder.on('build-finished', onBuildFinish);
  },

  unload () {
    Editor.Builder.removeListener('build-start', onBuildStart);
    Editor.Builder.removeListener('build-finished', onBuildFinish);
  },
};
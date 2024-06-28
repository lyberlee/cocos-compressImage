
// 日志函数
const log = (...args) => Editor.log(`[[post-compress-img]]::`, ...args);

const warn = (...args) => Editor.warn(`[[post-compress-img]]::`, ...args);

const error = (...args) => Editor.error(`[[post-compress-img]]::`, ...args);

// compress 压缩配置
const postBuildCompressConfig = { 
    hq: 0.8,
    lq: 0.6,
    includes: [], // 强制压缩的图片的uuid
    excludes: [], // 需要排除压缩图片的uuids
    threshold: 50,
    platform: {
      native: false, // ios、android打包是否生效
      weixin: false, // weixin打包是否压缩
      web: true, // web打包是否生效
    },
};  


module.exports = {
    error,
    log,
    warn,
    postBuildCompressConfig,
};
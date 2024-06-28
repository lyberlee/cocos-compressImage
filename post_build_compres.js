const { log, error, postBuildCompressConfig } = require('./utils');

const Path = require('path');
const Fs = require('fs');
const imagemin = require('imagemin')
const imageminPngquant = require('imagemin-pngquant')
const { imgDiff } = require("img-diff-js");
const imageminMozjpeg = require('imagemin-mozjpeg');

let BUILD_PATH = ''; // 构建后的输出路径

// 强制采用压缩的uuids
const FORCE_COMPRESS_UUIDS = postBuildCompressConfig.includes || []; 

/**
 * 获取构建后的输出图片地址
*/ 
function getBuildPath(buildPath) {
    return Path.join(buildPath, './diff_images');
}


/**
 * 压缩单个图像的任务
*/
function compress_by_imagemin(texture) {
    return new Promise(async(resolve, reject) => {
        const filePath = texture.path;
        const fileInfo = Path.parse(filePath);
        const dbPath = texture.dbPath;
        const uuid = texture.uuid;
        const sizeBefore = Fs.statSync(filePath).size;
        const DIFF_IMGS_DIR = getBuildPath(BUILD_PATH);
        const r = await imagemin([filePath], {
            destination: DIFF_IMGS_DIR,
            plugins: [
                imageminMozjpeg(),
                imageminPngquant({
                  quality: [postBuildCompressConfig.lq || 0.6, postBuildCompressConfig?.hq || 0.8],
                })
              ]
        });
        const { sourcePath, destinationPath } = r[0];
        const sizeAfter = Fs.statSync(destinationPath).size;
        const sizeSaved = sizeBefore - sizeAfter;
        const diffPath = Path.join(DIFF_IMGS_DIR, `diff_${fileInfo.base}`);
        if(sizeSaved > 0) {
            const res = await imgDiff({
                actualFilename: filePath,
                expectedFilename: destinationPath,
                diffFilename: diffPath,
                generateOnlyDiffFile: true,
            });
            if((res.diffCount <= (postBuildCompressConfig?.threshold || 10)) || (FORCE_COMPRESS_UUIDS.includes(uuid))) {
                log(`======${dbPath || filePath }压缩成功=====: 优化率${Math.floor(sizeSaved / sizeBefore * 100)}%`);
                const readStream = Fs.createReadStream(destinationPath);
                const writeStream = Fs.createWriteStream(sourcePath);
                readStream.pipe(writeStream);
                writeStream.on('finish', () => {
                    if(res.diffCount !== 0) {
                        Fs.unlinkSync(diffPath);
                    } 
                    Fs.unlinkSync(destinationPath);
                    resolve(true);
                });
            } else {
                error(`======${dbPath || filePath }压缩失败==========::: 压缩之后存在一定缺陷, diffPixelCount: ${res.diffCount}`);
                resolve(false);
            }
        } else {
            error(`======${dbPath || filePath }压缩失败==========::: 压缩之后体积变大, 无法再压缩`);
            Fs.unlinkSync(destinationPath);
            resolve(false);
        }
    })
}


// 收集spine资源的uuid
function getSpineUUid() {
    return new Promise((resolve, reject) => {
        Editor.assetdb.queryAssets('db://assets/**/*', 'spine', (err, assetInfos) => {
            const uuids = (assetInfos || []).map(item => item.uuid);
            resolve(uuids);
        });
    });
}

/**
 * 压缩图像整体任务
*/
function compressImgs(textures) {
    return new Promise((resolve, reject) => {
        let successCount = 0, errCount = 0;
        const recursionDoCompress = () => {
            if(textures.length === 0) {
                resolve({successCount, errCount});
            } else {
                log(`========剩余${textures.length}张图片等待处理 ====`);
                const texture = textures.shift();
                compress_by_imagemin(texture).then(res => {
                    if(res === true) {
                        successCount++;
                    } else {
                        errCount++;
                    }
                }).then(() => {
                    recursionDoCompress();
                }).catch(e => {
                    log('==========压缩异常========err:', e);
                    reject(e);
                });
            }
        };
        recursionDoCompress();
    });
}





async function postBulildCompress (options) {
    try {
        log(`=======compress tips==========: 
            1: 普通图片会打印 dbPath 路径, 图集则打印 nativePath 路径;
            2: spine 图片可能会进行alpha预乘操作，所以不会进行压缩处理`);
        BUILD_PATH = options.buildPath;
        const DIFF_IMGS_DIR = getBuildPath(BUILD_PATH);
        // 如果之前的差异文件存在，则先删除
        if(Fs.existsSync(DIFF_IMGS_DIR)) {
            log('=======删除文件夹======');
            Fs.rmSync(DIFF_IMGS_DIR, { recursive: true, force: true });
        }

        const startTime = Date.now();
        const imgInfos = []; // 图片路径信息日志
        const bundles = options.bundles || []; // 构建结果的bundles
        const spineImgUUids = []; // spine 资源依赖的图片uuid
        const spineUUids = await getSpineUUid();
        const excludeUUids = postBuildCompressConfig.excludes || [];

        // 搜索构建后的结果，并从中筛选所需要压缩的图片资源
        bundles.forEach(bundle => {
            const bundleResults = bundle.buildResults;
            const assetUUids = bundleResults.getAssetUuids();
            const textureType = cc.js._getClassId(cc.Texture2D);

             // 收集spine相关的uuid
             for(let j = 0; j < spineUUids.length; j++) {
                const spineUUid = spineUUids[j];
                if(bundleResults.containsAsset(spineUUid)){
                    const depUUids = bundleResults.getDependencies(spineUUid);
                    (depUUids || []).forEach(uuid => {
                        spineImgUUids.push(uuid);
                    });
                }
            }
    
            // 收集所有的图片uuid
            for (let i = 0; i < assetUUids.length; i++) {
                const uuid = assetUUids[i];
                if (bundleResults.getAssetType(uuid) === textureType && !spineImgUUids.includes(uuid) && !excludeUUids.includes(uuid)) {
                    const path = bundleResults.getNativeAssetPath(uuid);
                    const dbPath = Editor.assetdb.uuidToUrl(uuid);
                    if (path) imgInfos.push({ path, uuid, dbPath });
                }
            }
        });

        const { successCount, errCount } = await compressImgs(imgInfos);
        log(`=======successCount: ${successCount}, ======errorCount: ${errCount}`);
        log(`========整体压缩耗时：${(Date.now() - startTime)/1000}ms`)
        return true;
    } catch (error) {
        return Promise.resolve();
    }
}


 module.exports = {
    postBulildCompress
 };






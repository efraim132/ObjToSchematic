// Match webpack's raw-loader for the atlas used by real assignment/export tests.
module.exports = {
    getCacheKey(source) {
        return require('crypto').createHash('sha256').update('atlas-raw-v1').update(source).digest('hex');
    },
    process(source) {
        return { code: `module.exports = ${JSON.stringify(source)};` };
    },
};

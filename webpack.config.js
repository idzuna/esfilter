module.exports = {
    mode: 'development',
    entry: {
        images: './scripts/images.js',
        filter: './scripts/filter.js',
        filters: './scripts/filters.js',
    },
    output: {
        path: __dirname + '/public/scripts',
        filename: "[name].js"
    }
};
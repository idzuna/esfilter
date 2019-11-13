module.exports = {
    mode: 'development',
    entry: {
        filter: './scripts/filter.js',
        filters: './scripts/filters.js',
    },
    output: {
        path: __dirname + '/public/scripts',
        filename: "[name].js"
    }
};
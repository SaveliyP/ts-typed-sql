const nodeExternals = require('webpack-node-externals');

module.exports = (env, arg) => ({
    mode: "production",
    devtool: '',

    entry: {
        index: './src/index.ts'
    },

    resolve: {
        extensions: [
            '.ts',
        ],
        modules: [
            "./src",
            "./node_modules"
        ]
    },

    module: {
        rules: [{
                test: /\.ts$/,
                use: 'ts-loader'
            }
        ]
    },
    output: {
        filename: 'index.js',
        path: __dirname,
    },

    target: "node",
    externals: [nodeExternals()]
});

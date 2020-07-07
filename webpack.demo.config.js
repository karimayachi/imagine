const path = require('path');

module.exports = [
  {
    mode: 'development',
    entry: './demo/index.ts',
    target: 'web',
    devtool: 'inline-source-map',
    devServer: {
      contentBase: path.join(__dirname, 'demo')
    },
    module: {
      rules: [{
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    output: {
      path: __dirname + '/dist',
      publicPath: '/dist/',
      filename: 'index.js',
    }
  }
];
module.exports = [
  {
    mode: 'production',
    entry: './src/index.ts',
    target: 'web',
    module: {
      rules: [{
        test: /\.tsx?$/,
        use: { 
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json'
          }
        },
        exclude: /node_modules/
      }]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    output: {
      path: __dirname + '/dist/umd/',
      filename: 'index.js',
      library: 'imagine',
      libraryTarget: 'umd'
    },
    externals: {
      mobx: 'mobx'
    }
  }
];
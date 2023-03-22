const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const SveltePreprocess = require('svelte-preprocess');
const webpack = require('webpack');
const { Compilation } = webpack;

const cssHashMap = { App: 'a', Fa: 'f' };

module.exports = {
  // This says to webpack that we are in development mode and write the code in webpack file in different way
  mode: 'development',
  //Our index file
  entry: './src/index.js',
  //Where we put the production code
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    publicPath: './',
    clean: true,
  },
  module: {
    rules: [
      //Allows use of modern javascript
      {
        test: /\.js?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      //Allows use of svelte
      {
        test: /\.svelte$/,
        use: {
          loader: 'svelte-loader',
          options: {
            emitCss: true,
            preprocess: SveltePreprocess({
              less: true,
            }),
            compilerOptions: {
              cssHash: ({ hash, name, filename, css }) => `s-${cssHashMap[name] ?? hash(filename)}`,
            },
          },
        },
      },
      //Allows use of CSS
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              url: false,
            },
          },
        ],
      },
      //Allows use of images
      {
        test: /\.(jpg|jpeg|png|svg)$/,
        use: 'file-loader',
      },
    ],
  },
  //this is what enables users to leave off the extension when importing
  resolve: {
    alias: {
      svelte: path.resolve('node_modules', 'svelte'),
    },
    extensions: ['.mjs', '.js', '.svelte'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
    conditionNames: ['svelte'],
  },
  plugins: [
    //Allows to create an index.html in our build folder 
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/index.html'),
      inject: 'body',
    }),
    //This gets all our css and put in a unique file
    new MiniCssExtractPlugin({
      filename: 'main.css',
    }),
    //take our environment variable in .env file
    //And it does a text replace in the resulting bundle for any instances of process.env.
    new Dotenv(),
    // Inline CSS and JS
    {
      apply(compiler) {
        const pluginName = 'InlineCode';
        compiler.hooks.compilation.tap(pluginName, compilation => {
          compilation.hooks.processAssets.tapPromise(
            { name: pluginName, stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE },
            async assets => {
              for (const [ name, source ] of Object.entries(assets)) {
                if (name.match(/\.html$/)) {
                  let html = source.source().toString();
                  let m;
                  while ((m = /<script.*?src="\.\/([^"]+)"><\/script>/i.exec(html)) != null) {
                    const [ scriptName, start, end ] = [ m[1], m.index, m.index + m[0].length ];
                    const inlineScript = assets[scriptName].source().toString().trim();
                    html = `${html.substring(0, start)}<script>${inlineScript}</script>${html.substring(end)}`;
                    compilation.deleteAsset(scriptName);
                  }
                  while ((m = /<link.*?href="\.\/([^"]+)" rel="stylesheet">/i.exec(html)) != null) {
                    const [ styleName, start, end ] = [ m[1], m.index, m.index + m[0].length ];
                    const inlineStyle = assets[styleName].source().toString().trim();
                    html = `${html.substring(0, start)}<style>${inlineStyle}</style>${html.substring(end)}`;
                    compilation.deleteAsset(styleName);
                  }
                  html = html.replace(/ +/ig, " ");
                  compilation.updateAsset(name, new webpack.sources.RawSource(html));
                }
              }
            }
          )
        })
      },
    }
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  },
  //Config for webpack-dev-server module
  devServer: {
    historyApiFallback: true,
    contentBase: path.resolve(__dirname, 'dist'),
    hot: true,
  },
};
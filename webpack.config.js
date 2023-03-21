const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const SveltePreprocess = require('svelte-preprocess');

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
    }),
    //This gets all our css and put in a unique file
    new MiniCssExtractPlugin({
      filename: 'main.css',
    }),
    //take our environment variable in .env file
    //And it does a text replace in the resulting bundle for any instances of process.env.
    new Dotenv(),
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
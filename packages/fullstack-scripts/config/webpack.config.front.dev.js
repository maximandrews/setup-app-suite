/**
 * Copyright (c) 2018, Maxim Andrews, MaximAndrews.com
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HotClientPlugin = require('hot-client-plugin');
const FrontServePlugin = require('front-serve-plugin');
const eslintFormatter = require('react-dev-utils/eslintFormatter');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const checkRequiredFiles = require('react-dev-utils/checkRequiredFiles');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');

const cssAutoConfig = require('./css.auto.config');
const getClientEnvironment = require('./env');
const paths = require('./paths');

// Warn and crash if required files are missing
if (!checkRequiredFiles([paths.appHtml, paths.appIndexJs])) {
  process.exit(1);
}

// Webpack uses `publicPath` to determine where the app is being served from.
// In development, we always serve from the root. This makes config easier.
const publicPath = '/';
// `publicUrl` is just like `publicPath`, but we will provide it to our app
// as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
// Omit trailing slash as %PUBLIC_PATH%/xyz looks better than %PUBLIC_PATH%xyz.
const publicUrl = '';
// Get environment variables to inject into our app.
const env = getClientEnvironment(publicUrl);
// parsed package.json file
const pkgJsn = require(paths.appPackageJson);

// Protocol to use
const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';

// Generate ssl configuration
const sslObj = protocol === 'https' ? Object.assign(
  {
    passphrase: process.env.HTTPS_PASSPHRASE // A shared passphrase used for a single private key and/or a PFX.
  },
  process.env.HTTPS_KEY_PATH && process.env.HTTPS_CERT_PATH ? {
    key: fs.readFileSync(process.env.HTTPS_KEY_PATH), // Private keys in PEM format.
    cert: fs.readFileSync(process.env.HTTPS_CERT_PATH), // Cert chains in PEM format.
  } : {},
  process.env.HTTPS_PFX ? {
    pfx: process.env.HTTPS_PFX, // PFX or PKCS12 encoded private key and certificate chain.
  } : {}
) : false;

// This is the development configuration.
// It is focused on developer experience and fast rebuilds.
// The production configuration is different and lives in a separate file.
module.exports = webpackKoaServer => {
  return {
    // Name of the configuration to identify errors and warnings
    name: 'front-dev',
    // Should be configured in watch mode to have Hot Module Replacement
    watch: true,
    // We set mode in scripts/start.js
    mode: process.env.NODE_ENV,
    // You may want 'eval' instead if you prefer to see the compiled output in DevTools.
    // See the discussion in https://github.com/facebookincubator/create-react-app/issues/343.
    devtool: 'cheap-module-source-map',
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    // The first two entry points enable "hot" CSS and auto-refreshes for JS.
    entry: [
      // We ship a few polyfills by default:
      require.resolve('./polyfills'),
      // Include an alternative client for WebpackDevServer. A client's job is to
      // connect to WebpackDevServer by a socket and get notified about changes.
      // When you save a file, the client will either apply hot updates (in case
      // of CSS changes), or refresh the page (in case of JS changes). When you
      // make a syntax error, this client will display a syntax error overlay.
      // Note: instead of the default WebpackDevServer client, we use a custom one
      // to bring better experience for Create React App users. You can replace
      // the line below with these two lines if you prefer the stock client:
      // require.resolve('webpack-dev-server/client') + '?/',
      // require.resolve('webpack/hot/dev-server'),
      // require.resolve('hot-client-plugin/lib/hotClient'),
      // Finally, this is your app's code:
      paths.appIndexJs,
      // We include the app code last so that if there is a runtime error during
      // initialization, it doesn't blow up the WebpackDevServer client, and
      // changing JS code would still trigger a refresh.
    ],
    output: {
      // Default path to extract files
      path: '/',
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: true,
      // This does not produce a real file. It's just the virtual path that is
      // served by WebpackDevServer in development. This is the JS bundle
      // containing code from all our entry points, and the Webpack runtime.
      filename: 'static/js/bundle.js',
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: 'static/js/[name].chunk.js',
      // This is the URL that app is served from. We use "/" in development.
      publicPath: publicPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: info =>
        path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),
    },
    resolve: {
      // This allows you to set a fallback for where Webpack should look for modules.
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism.
      // https://github.com/facebookincubator/create-react-app/issues/253
      modules: ['node_modules', paths.appNodeModules].concat(
        // It is guaranteed to exist because we tweak it in `env.js`
        process.env.NODE_PATH.split(path.delimiter).filter(Boolean)
      ),
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebookincubator/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: ['.web.js', '.mjs', '.js', '.json', '.web.jsx', '.jsx'],
      alias: {
        // Resolve Babel runtime relative to react-scripts.
        // It usually still works on npm 3 without this but it would be
        // unfortunate to rely on, as react-scripts could be symlinked,
        // and thus babel-runtime might not be resolvable from the source.
        'babel-runtime': path.dirname(
          require.resolve('babel-runtime/package.json')
        ),
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
      },
      plugins: [
        // Prevents users from importing files from outside of src/ (or node_modules/).
        // This often causes confusion because we only process files within src/ with babel.
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
        // please link the files into your node_modules/ and let module-resolution kick in.
        // Make sure your source files are compiled, as they will not be processed in any way.
        new ModuleScopePlugin(paths.appSrc, [paths.appPackageJson]),
      ],
    },
    module: {
      strictExportPresence: true,
      rules: [
        // TODO: Disable require.ensure as it's not a standard language feature.
        // We are waiting for https://github.com/facebookincubator/create-react-app/issues/2176.
        // { parser: { requireEnsure: false } },

        // First, run the linter.
        // It's important to do this before Babel processes the JS.
        {
          test: /\.(js|jsx|mjs)$/,
          enforce: 'pre',
          use: [
            {
              options: {
                formatter: eslintFormatter,
                eslintPath: require.resolve('eslint'),
                baseConfig: {
                  extends: [require.resolve('eslint-config-react-app')],
                },
                ignore: false,
                useEslintrc: false,
              },
              loader: require.resolve('eslint-loader'),
            },
          ],
          include: paths.appSrc,
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          oneOf: [
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              loader: require.resolve('url-loader'),
              options: {
                limit: 1000,
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
            // Process JS with Babel.
            {
              test: /\.(js|jsx|mjs)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                presets: [[require.resolve('@babel/preset-react'), { development: process.env.NODE_ENV === 'development' }]],
                plugins: [require.resolve('@babel/plugin-proposal-object-rest-spread')],
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true
              },
            },
            // Configure css according to the current mode, i.e. 'developement' or 'production'
            cssAutoConfig(pkgJsn).cssConfig(),
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/\.(js|jsx|mjs)$/, /\.html$/, /\.json$/],
              loader: require.resolve('file-loader'),
              options: {
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
          ],
        },
        // ** STOP ** Are you adding a new loader?
        // Make sure to add the new loader(s) before the "file" loader.
      ],
    },
    plugins: [
      // This is necessary to apply hot updates
      new HotClientPlugin({
        staticContent: paths.appPublic,
        editor: { allowedIPs: '127.0.0.1' },
        // Enable HTTPS if the HTTPS environment variable is set to 'true'
        https: sslObj
      }),
      // Serving frontend files
      new FrontServePlugin({
        server: webpackKoaServer,
        appName: pkgJsn.name,
        template: paths.appHtml,
        env: env.raw,
        host: process.env.HOST || '0.0.0.0',
        port: parseInt(process.env.PORT, 10) || 3000,
        ssl: sslObj,
        content: paths.appPublic,
        defaultIndex: path.basename(paths.appHtml)
      }),
      // Add module names to factory functions so they appear in browser profiler.
      new webpack.NamedModulesPlugin(),
      // Makes some environment variables available to the JS code, for example:
      // if (process.env.NODE_ENV === 'development') { ... }. See `./env.js`.
      new webpack.DefinePlugin(env.stringified),
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // See https://github.com/facebookincubator/create-react-app/issues/240
      new CaseSensitivePathsPlugin(),
      // If you require a missing module and then `npm install` it, you still have
      // to restart the development server for Webpack to discover it. This plugin
      // makes the discovery automatic so you don't have to restart.
      // See https://github.com/facebookincubator/create-react-app/issues/186
      new WatchMissingNodeModulesPlugin(paths.appNodeModules),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how Webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    ],
    // Some libraries import Node modules but don't use them in the browser.
    // Tell Webpack to provide empty mocks for them so importing them works.
    node: {
      dgram: 'empty',
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      child_process: 'empty',
    },
    // Turn off performance hints during development because we don't do any
    // splitting or minification in interest of speed. These warnings become
    // cumbersome.
    performance: {
      hints: false,
    },
  };
};
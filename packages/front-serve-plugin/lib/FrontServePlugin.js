/**
 * Copyright (c) 2018-present, Maxim Andrews, maximandrews.com
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const mime = require('mime');
const path = require('path');
const debug = require('debug');
const { parse } = require('url');
const EventEmitter = require('events');
const querystring = require('querystring');
const MemoryFileSystem = require('memory-fs');
const WebpackKoaServer = require('webpack-koa-server');
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');

class FrontServePlugin {
  constructor (options = {}) {
    const {
      injectJs = true,
      contentWare = true,
      server,
      template,
      env = [],
      host = '0.0.0.0',
      port = 3000,
      ssl = false, // { key, cert, pfx, passphrase }
      protocol = 'http', // http | http2
      content = [],
      open = true,
      appName = 'website',
      allowedMethods = ['GET'],
      defaultIndex = 'index.html',
      proxy = false, // { proxy config }
      addMiddleware
    } = options;

    this.injectJs = injectJs;
    this.contentWare = contentWare;
    this.defaultIndex = defaultIndex;
    this.allowedMethods = allowedMethods;

    this.server = server instanceof WebpackKoaServer
      ? server
      : new WebpackKoaServer({
        host,
        port,
        ssl,
        protocol,
        content,
        open,
        appName,
        proxy,
        template,
        env,
        addMiddleware
      });

    this.isFirstCompile = true;
    this.formatWebpackMessages = formatWebpackMessages;

    this.parseUrl = parse;
    this.mime = mime;
    this.unescape = querystring.unescape;

    this.debug = debug('front-serve-plugin');

    this.HASH_REGEXP = /[0-9a-f]{10,}/;

    this.emitter = new EventEmitter();
    this.contentReady = false;
    this.contentCompiled = false;
  }

  apply (compiler) {
    const { watch, name, target, output: { path: outputPath, publicPath, filename } } = compiler.options;
    if (!watch) {
      throw Error('FrontServePlugin should be configured in `watch` only mode. Configuration option `watch` should be equal to `true`.');
    }

    if (!name) {
      throw Error('FrontServePlugin should be used in webpack configuration with unique `name` option only. This will help to identify errors and warnings.');
    }

    if (!target) {
      throw Error('FrontServePlugin should be used in webpack configuration with set `target` option only.');
    }

    if (target !== 'web') {
      throw Error('FrontServePlugin should be used in webpack configuration with option `target` set to `web` only.');
    }

    if (typeof outputPath === 'string' && !path.isAbsolute(outputPath)) {
      throw new Error(
        'The \'output.path\' must be an absolute path which starts with'
          + `${ process.platform === 'win32'
            ? '\'C:\\\\\' or \'C:/\' or \'//\' or \'\\\\\''
            : '\'/\'' }.`
      );
    }

    this.outputPath = outputPath;
    this.publicPath = publicPath;
    this.bundleFilename = filename;

    if (compiler.outputFileSystem instanceof MemoryFileSystem) {
      this.fileSystem = compiler.outputFileSystem;
    } else {
      compiler.outputFileSystem = this.fileSystem = new MemoryFileSystem();
    }

    this.compiler = compiler;

    compiler.hooks.entryOption.tap('FrontServePlugin', this.readyStartServer.bind(this));

    compiler.hooks.done.tap('FrontServePlugin', this.compilerDone.bind(this));
    compiler.hooks.failed.tap('FrontServePlugin', this.debug);
    compiler.hooks.invalid.tap('FrontServePlugin', this.compilerIvalidated.bind(this));

    this.pluginId = this.server.registerPlugin(this);

    if (this.injectJs) {
      this.server.on('template-invalid', this.contentInvalid.bind(this));
      this.server.on('template-loaded', this.inject.bind(this));
      this.server.on('template-refreshed', this.inject.bind(this));
    }

    this.server.addPluginMiddleware(() => this.contentMiddleware.bind(this), 1000);

    // Run manually once to show this compiler is compiling
    this.compilerIvalidated();
  }

  readyStartServer () {
    this.server.emit('start-server', this.pluginId);
  }

  compilerIvalidated () {
    this.contentCompiled = false;
    this.server.emit('compilation-invalid', this.pluginId);
  }

  compilerDone (stats) {
    this.lastStats = stats;
    // We only construct the warnings and errors for speed:
    // https://github.com/facebook/create-react-app/issues/4492#issuecomment-421959548
    const messages = this.formatWebpackMessages(
      stats.toJson({ all: false, warnings: true, errors: true })
    );

    this.server.emit('compilation-done', this.pluginId, messages);

    this.contentCompiled = true;
    this.emitter.emit('contentCompiled');
    this.server.refreshTemplate();
  }

  contentInvalid () {
    this.contentReady = false;
  }

  async contentMiddleware(ctx, next) {
    const allowedMethods = this.allowedMethods;
    if (allowedMethods.indexOf(ctx.method) === -1) {
      return next();
    }

    let filename = this.extractFilename(ctx.url);

    if (!filename) {
      return next();
    }

    let shouldAwaitContent = true;
    let resourceStat;

    if (this.HASH_REGEXP.test(filename)) {
      try {
        resourceStat = this.fileSystem.statSync(filename);
        shouldAwaitContent = !resourceStat.isFile();
      } catch (e) {
        shouldAwaitContent = true;
      }
    }

    if (shouldAwaitContent) {
      await this.waitForCompiled();
      await this.waitForContent();
    }

    try {
      resourceStat = this.fileSystem.statSync(filename);
    } catch (e) {
      return next();
    }

    if (resourceStat.isDirectory()
        && typeof this.defaultIndex === 'string'
        && this.defaultIndex.length > 0) {
      filename = path.join(filename, this.defaultIndex);

      try {
        resourceStat = this.fileSystem.statSync(filename);
      } catch (e) {
        return next();
      }
    }

    if (!resourceStat.isFile()) {
      return next();
    }

    ctx.type = this.mime.getType(filename); // eslint-disable-line require-atomic-updates
    ctx.body = this.fileSystem.readFileSync(filename); // eslint-disable-line require-atomic-updates
  }

  extractFilename (url) {
    const publicUrl = this.parseUrl(this.publicPath || '/', false, true);
    const requestedUrl = this.parseUrl(url);

    // publicPath is not in url, so it should fail
    if (requestedUrl.pathname.indexOf(publicUrl.pathname) !== 0) {
      return false;
    }

    const filename = requestedUrl.pathname.substring(publicUrl.pathname.length);

    return this.unescape(
      filename ? path.join(this.outputPath, filename) : this.outputPath
    );
  }

  async waitForContent () {
    if (this.contentReady) {
      return Promise.resolve();
    }

    this.debug('FrontServePlugin is waiting untill content will be available');

    return new Promise(resolve => {
      this.emitter.once('contentReady', resolve);
    });
  }

  async waitForCompiled () {
    if (this.contentCompiled) {
      return Promise.resolve();
    }

    this.debug('FrontServePlugin is waiting untill compiled');

    return new Promise(resolve => {
      this.emitter.once('contentCompiled', resolve);
    });
  }

  async inject () {
    const { templateHtml, callback } = await this.server.updateTemplate();

    await this.waitForCompiled();

    const bundleFile = path.join(this.publicPath, this.bundleFilename);
    const allFiles = this.lastStats ? Object.keys(this.lastStats.compilation.assets) : [];
    const jsFilesOnly = allFiles.filter(file => /\.js$/.test(file));

    const hotUpdate = /\.hot-update\.js$/;

    jsFilesOnly.sort((a, b) => {
      if (a === bundleFile) {
        return -1;
      } else if (b === bundleFile) {
        return 1;
      } else if (hotUpdate.test(a) && !hotUpdate.test(b)) {
        return 1;
      } else if (!hotUpdate.test(a) && hotUpdate.test(b)) {
        return -1;
      } else if (a < b) {
        return -1;
      } else if (a > b) {
        return 1;
      }

      // names must be equal
      return 0;
    });

    const injectJs = jsFilesOnly.reduce((tags, file) => {
      const tag = `<script type="text/javascript" src="${path.join(this.publicPath, file)}"></script>`;

      if (!templateHtml.includes(tag)) {
        tags.push(tag);
      }

      return tags;
    }, []);

    callback(
      templateHtml.replace(
        /^(\s*)<\/body>/m,
        `$1$1${ injectJs.join('\n$1$1') }\n$1</body>`
      )
    );

    this.contentReady = true;
    this.emitter.emit('contentReady');
  }
}

module.exports = FrontServePlugin;

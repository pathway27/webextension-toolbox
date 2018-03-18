const { resolve } = require('path')
const webpack = require('webpack')
const CleanPlugin = require('clean-webpack-plugin')
const GlobEntriesPlugin = require('webpack-watched-glob-entries-plugin')
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const ZipPlugin = require('zip-webpack-plugin')
const compileManifest = require('./manifest')
const getExtensionInfo = require('./utils/get-extension-info')
const getExtensionFileType = require('./utils/get-extension-file-type')
const validateVendor = require('./utils/validate-vendor')
const createPreset = require('./preset')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')

module.exports = function webpackConfig ({
  src = 'app',
  target = 'build/[vendor]',
  packageTarget = 'packages',
  dev = false,
  copyIgnore = [ '**/*.js', '**/*.json' ],
  autoReload = false,
  devtool = false,
  pack = false,
  vendor = 'chrome',
  vendorVersion
} = {}) {
  // Input validation
  validateVendor(vendor)

  // Compile variable targets
  target = resolve(target.replace('[vendor]', vendor))
  packageTarget = resolve(packageTarget.replace('[vendor]', vendor))

  // Get some defaults
  const { version, name, description } = getExtensionInfo(src)
  const mode = dev ? 'development' : 'production'

  /******************************/
  /*      WEBPACK               */
  /******************************/
  const config = {
    mode,
    context: resolve(src, '../')
  }

  // Source-Maps
  config.devtool = devtool

  /******************************/
  /*       WEBPACK.ENTRY        */
  /******************************/
  const entries = []

  // Add main entry glob
  entries.push(resolve(src, '*.js'))
  entries.push(resolve(src, '?(scripts)/*.js'))

  // Add autoReload in dev
  if (autoReload && ['chrome', 'opera'].includes(vendor)) {
    entries.push(
      resolve(__dirname, './auto-reload')
    )
  }

  // We use the GlobEntriesPlugin in order to
  // restart the compiler in watch mode, when new
  // files got added.
  config.entry = GlobEntriesPlugin.getEntries(
    entries
  )

  /******************************/
  /*       WEBPACK.OUTPUT       */
  /******************************/
  config.output = {
    path: target,
    filename: '[name].js',
    chunkFilename: '[id].chunk.js'
  }

  /******************************/
  /*       WEBPACK.LOADERS      */
  /******************************/
  config.module = {
    rules: []
  }

  // Add babel support
  config.module.rules.push({
    test: /\.(js|jsx|mjs)$/,
    exclude: /node_modules/,
    use: {
      loader: require.resolve('babel-loader'),
      options: {
        cacheDirectory: true,
        ...createPreset({
          vendor,
          vendorVersion
        })
      }
    }
  })

  config.module.rules.push({
    test: /\.vue$/,
    exclude: /node_modules/,
    loader: 'vue-loader'
  })

  /******************************/
  /*     WEBPACK.PLUGINS        */
  /******************************/
  config.plugins = []

  // Clear output directory
  config.plugins.push(new CleanPlugin([target], { allowExternal: true }))

  // Watcher doesn't work well if you mistype casing in a path so we use
  // a plugin that prints an error when you attempt to do this.
  config.plugins.push(new CaseSensitivePathsPlugin())

  // Add Wilcard Entry Plugin
  config.plugins.push(new GlobEntriesPlugin())

  // Add module names to factory functions so they appear in browser profiler
  if (dev) {
    config.plugins.push(new webpack.NamedModulesPlugin())
  }

  // Add webextension polyfill
  if (['chrome', 'opera'].includes(vendor)) {
    config.plugins.push(
      new webpack.ProvidePlugin({
        browser: require.resolve('./webextension-polyfill')
      })
    )
  }

  // Set environment vars
  config.plugins.push(
    new webpack.EnvironmentPlugin({
      NODE_ENV: mode,
      VENDOR: vendor,
      WEBEXTENSION_TOOLBOX_VERSION: version
    })
  )

  // Copy non js files & compile manifest
  config.plugins.push(
    new CopyPlugin([
      {
        // Copy all files except (.js, .json, _locales)
        context: resolve(src),
        from: resolve(src, '**/*'),
        ignore: copyIgnore,
        to: target
      },
      {
        // Copy & Tranform manifest
        from: resolve(src, 'manifest.json'),
        transform: str => compileManifest(str, {
          vendor,
          autoReload,
          name,
          version,
          description
        })
      },
      {
        // Copy all files except (.js, .json, _locales)
        context: resolve(src),
        from: resolve(src, '_locales/**/*.json'),
        to: target
      }
    ])
  )

  // Minify in production
  if (!dev) {
    config.plugins.push(new UglifyJsPlugin({
      parallel: true,
      uglifyOptions: {
        ecma: 8
      }
    }))
  }

  // Pack extension
  if (pack) {
    config.plugins.push(new ZipPlugin({
      path: packageTarget,
      filename: `${name}.v${version}.${vendor}.${getExtensionFileType(vendor)}`
    }))
  }

  return config
}

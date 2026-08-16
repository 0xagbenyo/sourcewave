module.exports = function (api) {
  api.cache(true);

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production';

  const plugins = [];
  if (isProduction) {
    try {
      require.resolve('babel-plugin-transform-remove-console');
      plugins.push(['transform-remove-console', { exclude: ['error'] }]);
    } catch {
      // Plugin optional — productionChecks / IS_DEBUG_MODE still gate noisy logs.
    }
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};

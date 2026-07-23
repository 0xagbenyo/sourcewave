module.exports = function (api) {
  api.cache(true);

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production';

  const plugins = [];
  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['error'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};

const { WebpackReactSourcemapsPlugin } = require("@acemarke/react-prod-sourcemaps");

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      webpackConfig.plugins.push(WebpackReactSourcemapsPlugin({ debug: false, preserve: false }));
      return webpackConfig;
    },
  },
};

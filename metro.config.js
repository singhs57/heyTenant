const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const os = require("os");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Store Metro cache outside OneDrive to prevent TreeFS conflicts
// caused by OneDrive locking files during sync.
config.cacheStores = [];
config.hasteImpl = undefined;

// Redirect the file-map cache to the OS temp directory
config.fileMapCacheDirectory = path.join(
  os.tmpdir(),
  "metro-file-map-heytenant"
);
fs.mkdirSync(config.fileMapCacheDirectory, { recursive: true });

module.exports = config;

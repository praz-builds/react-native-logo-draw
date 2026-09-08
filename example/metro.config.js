/**
 * The example consumes the library from the repo root, not from npm.
 *
 * Metro does not follow `file:..` on its own, so the root is added as a watch
 * folder and aliased by name. React and react-native are then *blocked* inside
 * the root's node_modules: the library keeps its own dev copies for tests, and
 * without this the example would end up with two Reacts and a very confusing
 * hooks error.
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shared = ['react', 'react-dom', 'react-native', 'react-native-svg'];

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.extraNodeModules = {
  'react-native-logo-draw': root,
};
config.resolver.blockList = [
  new RegExp(`^${escape(path.join(root, 'node_modules'))}\\/(${shared.join('|')})\\/.*$`),
];

module.exports = config;

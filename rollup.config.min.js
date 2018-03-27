import uglify from 'rollup-plugin-uglify';
import config from './rollup.config';

config.plugins.push(uglify());
config.output = {
  name: 'asn1.js',
  file: 'dist/asn1.min.js',
  format: 'iife'
};

export default config;

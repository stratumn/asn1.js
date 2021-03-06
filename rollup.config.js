import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve';
import babelrc from 'babelrc-rollup';

const pkg = require('./package.json');

export default {
  input: 'lib/asn1.js',
  external: Object.keys(pkg.dependencies),
  plugins: [
    babel(
      Object.assign(
        {
          include: ['lib/**']
        },
        babelrc()
      )
    ),
    nodeResolve({
      jsnext: true,
      preferBuiltins: true
    })
  ],
  output: {
    file: pkg.main,
    format: 'cjs'
  }
};

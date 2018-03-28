import commonjs from 'rollup-plugin-commonjs';
import nodeResolve from 'rollup-plugin-node-resolve';
import builtins from 'rollup-plugin-node-builtins';
import babel from 'rollup-plugin-babel';
import babelrc from 'babelrc-rollup';

export default {
  input: 'lib/asn1.js',
  plugins: [
    babel(
      Object.assign(
        {
          include: ['lib/**']
        },
        babelrc()
      )
    ),
    builtins(),
    nodeResolve({
      jsnext: true,
      browser: true,
      preferBuiltins: true
    }),
    commonjs()
  ],
  output: {
    name: 'asn1.js',
    format: 'umd',
    file: 'dist/asn1.js'
  }
};

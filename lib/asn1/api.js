import inherits from 'inherits';
import { runInThisContext } from 'vm';

import * as encoders from './encoders';
import * as decoders from './decoders';

export const define = (name, body) => {
  return new Entity(name, body);
};

function Entity(name, body) {
  this.name = name;
  this.body = body;

  this.decoders = {};
  this.encoders = {};
}

Entity.prototype._createNamed = function createNamed(base) {
  let named;
  try {
    named = runInThisContext(
      '(function ' +
        this.name +
        '(entity) {\n' +
        '  this._initNamed(entity);\n' +
        '})'
    );
  } catch (e) {
    named = function(entity) {
      this._initNamed(entity);
    };
  }
  inherits(named, base);
  named.prototype._initNamed = function initnamed(entity) {
    base.call(this, entity);
  };

  return new named(this);
};

Entity.prototype._getDecoder = function _getDecoder(enc) {
  const encoding = enc || 'der';
  // Lazily create decoder
  if (!this.decoders.hasOwnProperty(encoding))
    this.decoders[encoding] = this._createNamed(decoders[encoding]);
  return this.decoders[encoding];
};

Entity.prototype.decode = function decode(data, enc, options) {
  return this._getDecoder(enc).decode(data, options);
};

Entity.prototype._getEncoder = function _getEncoder(enc) {
  const encoding = enc || 'der';
  // Lazily create encoder
  if (!this.encoders.hasOwnProperty(encoding))
    this.encoders[encoding] = this._createNamed(encoders[encoding]);
  return this.encoders[encoding];
};

Entity.prototype.encode = function encode(data, enc, /* internal */ reporter) {
  return this._getEncoder(enc).encode(data, reporter);
};

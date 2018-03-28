'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var inherits = _interopDefault(require('inherits'));
var assert = _interopDefault(require('minimalistic-assert'));
var bignum = _interopDefault(require('bn.js'));
var vm = require('vm');

function Reporter(options) {
  this._reporterState = {
    obj: null,
    path: [],
    options: options || {},
    errors: []
  };
}

Reporter.prototype.isError = function isError(obj) {
  return obj instanceof ReporterError;
};

Reporter.prototype.save = function save() {
  var state = this._reporterState;

  return { obj: state.obj, pathLen: state.path.length };
};

Reporter.prototype.restore = function restore(data) {
  var state = this._reporterState;

  state.obj = data.obj;
  state.path = state.path.slice(0, data.pathLen);
};

Reporter.prototype.enterKey = function enterKey(key) {
  return this._reporterState.path.push(key);
};

Reporter.prototype.exitKey = function exitKey(index) {
  var state = this._reporterState;

  state.path = state.path.slice(0, index - 1);
};

Reporter.prototype.leaveKey = function leaveKey(index, key, value) {
  var state = this._reporterState;

  this.exitKey(index);
  if (state.obj !== null) state.obj[key] = value;
};

Reporter.prototype.path = function path() {
  return this._reporterState.path.join('/');
};

Reporter.prototype.enterObject = function enterObject() {
  var state = this._reporterState;

  var prev = state.obj;
  state.obj = {};
  return prev;
};

Reporter.prototype.leaveObject = function leaveObject(prev) {
  var state = this._reporterState;

  var now = state.obj;
  state.obj = prev;
  return now;
};

Reporter.prototype.error = function error(msg) {
  var err = void 0;
  var state = this._reporterState;

  var inherited = msg instanceof ReporterError;
  if (inherited) {
    err = msg;
  } else {
    err = new ReporterError(state.path.map(function (elem) {
      return '[' + JSON.stringify(elem) + ']';
    }).join(''), msg.message || msg, msg.stack);
  }

  if (!state.options.partial) throw err;

  if (!inherited) state.errors.push(err);

  return err;
};

Reporter.prototype.wrapResult = function wrapResult(result) {
  var state = this._reporterState;
  if (!state.options.partial) return result;

  return {
    result: this.isError(result) ? null : result,
    errors: state.errors
  };
};

function ReporterError(path, msg) {
  this.path = path;
  this.rethrow(msg);
}
inherits(ReporterError, Error);

ReporterError.prototype.rethrow = function rethrow(msg) {
  this.message = msg + ' at: ' + (this.path || '(shallow)');
  if (Error.captureStackTrace) Error.captureStackTrace(this, ReporterError);

  if (!this.stack) {
    try {
      // IE only adds stack when thrown
      throw new Error(this.message);
    } catch (e) {
      this.stack = e.stack;
    }
  }
  return this;
};

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
  return typeof obj;
} : function (obj) {
  return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
};

function DecoderBuffer(base, options) {
  Reporter.call(this, options);
  if (!Buffer.isBuffer(base)) {
    this.error('Input not Buffer');
    return;
  }

  this.base = base;
  this.offset = 0;
  this.length = base.length;
}
inherits(DecoderBuffer, Reporter);

DecoderBuffer.prototype.save = function save() {
  return { offset: this.offset, reporter: Reporter.prototype.save.call(this) };
};

DecoderBuffer.prototype.restore = function restore(save) {
  // Return skipped data
  var res = new DecoderBuffer(this.base);
  res.offset = save.offset;
  res.length = this.offset;

  this.offset = save.offset;
  Reporter.prototype.restore.call(this, save.reporter);

  return res;
};

DecoderBuffer.prototype.isEmpty = function isEmpty() {
  return this.offset === this.length;
};

DecoderBuffer.prototype.readUInt8 = function readUInt8(fail) {
  if (this.offset + 1 <= this.length) return this.base.readUInt8(this.offset++, true);else return this.error(fail || 'DecoderBuffer overrun');
};

DecoderBuffer.prototype.skip = function skip(bytes, fail) {
  if (!(this.offset + bytes <= this.length)) return this.error(fail || 'DecoderBuffer overrun');

  var res = new DecoderBuffer(this.base);

  // Share reporter state
  res._reporterState = this._reporterState;

  res.offset = this.offset;
  res.length = this.offset + bytes;
  this.offset += bytes;
  return res;
};

DecoderBuffer.prototype.raw = function raw(save) {
  return this.base.slice(save ? save.offset : this.offset, this.length);
};

function EncoderBuffer(value, reporter) {
  if (Array.isArray(value)) {
    this.length = 0;
    this.value = value.map(function (_item) {
      var item = _item;
      if (!(item instanceof EncoderBuffer)) item = new EncoderBuffer(item, reporter);
      this.length += item.length;
      return item;
    }, this);
  } else if (typeof value === 'number') {
    if (!(0 <= value && value <= 0xff)) return reporter.error('non-byte EncoderBuffer value');
    this.value = value;
    this.length = 1;
  } else if (typeof value === 'string') {
    this.value = value;
    this.length = Buffer.byteLength(value);
  } else if (Buffer.isBuffer(value)) {
    this.value = value;
    this.length = value.length;
  } else {
    return reporter.error('Unsupported type: ' + (typeof value === 'undefined' ? 'undefined' : _typeof(value)));
  }
}

EncoderBuffer.prototype.join = function join(_out, _offset) {
  var out = _out;
  var offset = _offset;
  if (!out) out = new Buffer(this.length);
  if (!offset) offset = 0;

  if (this.length === 0) return out;

  if (Array.isArray(this.value)) {
    this.value.forEach(function (item) {
      item.join(out, offset);
      offset += item.length;
    });
  } else {
    if (typeof this.value === 'number') out[offset] = this.value;else if (typeof this.value === 'string') out.write(this.value, offset);else if (Buffer.isBuffer(this.value)) this.value.copy(out, offset);
    offset += this.length;
  }

  return out;
};

// Supported tags
var tags = ['seq', 'seqof', 'set', 'setof', 'objid', 'bool', 'gentime', 'utctime', 'null_', 'enum', 'int', 'objDesc', 'bitstr', 'bmpstr', 'charstr', 'genstr', 'graphstr', 'ia5str', 'iso646str', 'numstr', 'octstr', 'printstr', 't61str', 'unistr', 'utf8str', 'videostr'];

// Public methods list
var methods = ['key', 'obj', 'use', 'optional', 'explicit', 'implicit', 'def', 'choice', 'any', 'contains'].concat(tags);

// Overrided methods list
var overrided = ['_peekTag', '_decodeTag', '_use', '_decodeStr', '_decodeObjid', '_decodeTime', '_decodeNull', '_decodeInt', '_decodeBool', '_decodeList', '_encodeComposite', '_encodeStr', '_encodeObjid', '_encodeTime', '_encodeNull', '_encodeInt', '_encodeBool'];

function Node(enc, parent) {
  var state = {};
  this._baseState = state;

  state.enc = enc;

  state.parent = parent || null;
  state.children = null;

  // State
  state.tag = null;
  state.args = null;
  state.reverseArgs = null;
  state.choice = null;
  state.optional = false;
  state.any = false;
  state.obj = false;
  state.use = null;
  state.useDecoder = null;
  state.key = null;
  state['default'] = null;
  state.explicit = null;
  state.implicit = null;
  state.contains = null;

  // Should create new instance on each method
  if (!state.parent) {
    state.children = [];
    this._wrap();
  }
}

var stateProps = ['enc', 'parent', 'children', 'tag', 'args', 'reverseArgs', 'choice', 'optional', 'any', 'obj', 'use', 'alteredUse', 'key', 'default', 'explicit', 'implicit', 'contains'];

Node.prototype.clone = function clone() {
  var state = this._baseState;
  var cstate = {};
  stateProps.forEach(function (prop) {
    cstate[prop] = state[prop];
  });
  var res = new this.constructor(cstate.parent);
  res._baseState = cstate;
  return res;
};

Node.prototype._wrap = function wrap() {
  var state = this._baseState;
  methods.forEach(function (method) {
    this[method] = function _wrappedMethod() {
      var clone = new this.constructor(this);
      state.children.push(clone);
      return clone[method].apply(clone, arguments);
    };
  }, this);
};

Node.prototype._init = function init(body) {
  var state = this._baseState;

  assert(state.parent === null);
  body.call(this);

  // Filter children
  state.children = state.children.filter(function (child) {
    return child._baseState.parent === this;
  }, this);
  assert.equal(state.children.length, 1, 'Root node can have only one child');
};

Node.prototype._useArgs = function useArgs(_args) {
  var args = _args;
  var state = this._baseState;

  // Filter children and args
  var children = args.filter(function (arg) {
    return arg instanceof this.constructor;
  }, this);
  args = args.filter(function (arg) {
    return !(arg instanceof this.constructor);
  }, this);

  if (children.length !== 0) {
    assert(state.children === null);
    state.children = children;

    // Replace parent to maintain backward link
    children.forEach(function (child) {
      child._baseState.parent = this;
    }, this);
  }
  if (args.length !== 0) {
    assert(state.args === null);
    state.args = args;
    state.reverseArgs = args.map(function (arg) {
      if ((typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) !== 'object' || arg.constructor !== Object) return arg;

      var res = {};
      Object.keys(arg).forEach(function (_key) {
        var key = _key;
        if (key == (key | 0)) key |= 0;
        var value = arg[key];
        res[value] = key;
      });
      return res;
    });
  }
};

//
// Overrided methods
//

overrided.forEach(function (method) {
  Node.prototype[method] = function _overrided() {
    var state = this._baseState;
    throw new Error(method + ' not implemented for encoding: ' + state.enc);
  };
});

//
// Public methods
//

tags.forEach(function (tag) {
  Node.prototype[tag] = function _tagMethod() {
    var state = this._baseState;
    var args = Array.prototype.slice.call(arguments);

    assert(state.tag === null);
    state.tag = tag;

    this._useArgs(args);

    return this;
  };
});

Node.prototype.use = function use(item) {
  assert(item);
  var state = this._baseState;

  assert(state.use === null);
  state.use = item;

  return this;
};

Node.prototype.optional = function optional() {
  var state = this._baseState;

  state.optional = true;

  return this;
};

Node.prototype.def = function def(val) {
  var state = this._baseState;

  assert(state['default'] === null);
  state['default'] = val;
  state.optional = true;

  return this;
};

Node.prototype.explicit = function explicit(num) {
  var state = this._baseState;

  assert(state.explicit === null && state.implicit === null);
  state.explicit = num;

  return this;
};

Node.prototype.implicit = function implicit(num) {
  var state = this._baseState;

  assert(state.explicit === null && state.implicit === null);
  state.implicit = num;

  return this;
};

Node.prototype.obj = function obj() {
  var state = this._baseState;
  var args = Array.prototype.slice.call(arguments);

  state.obj = true;

  if (args.length !== 0) this._useArgs(args);

  return this;
};

Node.prototype.key = function key(newKey) {
  var state = this._baseState;

  assert(state.key === null);
  state.key = newKey;

  return this;
};

Node.prototype.any = function any() {
  var state = this._baseState;

  state.any = true;

  return this;
};

Node.prototype.choice = function choice(obj) {
  var state = this._baseState;

  assert(state.choice === null);
  state.choice = obj;
  this._useArgs(Object.keys(obj).map(function (key) {
    return obj[key];
  }));

  return this;
};

Node.prototype.contains = function contains(item) {
  var state = this._baseState;

  assert(state.use === null);
  state.contains = item;

  return this;
};

//
// Decoding
//

Node.prototype._decode = function decode(_input, options) {
  var state = this._baseState;
  var input = _input;
  // Decode root node
  if (state.parent === null) return input.wrapResult(state.children[0]._decode(input, options));

  var result = state['default'];
  var present = true;

  var prevKey = null;
  if (state.key !== null) prevKey = input.enterKey(state.key);

  // Check if tag is there
  if (state.optional) {
    var tag = null;
    if (state.explicit !== null) tag = state.explicit;else if (state.implicit !== null) tag = state.implicit;else if (state.tag !== null) tag = state.tag;

    if (tag === null && !state.any) {
      // Trial and Error
      var save = input.save();
      try {
        if (state.choice === null) this._decodeGeneric(state.tag, input, options);else this._decodeChoice(input, options);
        present = true;
      } catch (e) {
        present = false;
      }
      input.restore(save);
    } else {
      present = this._peekTag(input, tag, state.any);

      if (input.isError(present)) return present;
    }
  }

  // Push object on stack
  var prevObj = void 0;
  if (state.obj && present) prevObj = input.enterObject();

  if (present) {
    // Unwrap explicit values
    if (state.explicit !== null) {
      var explicit = this._decodeTag(input, state.explicit);
      if (input.isError(explicit)) return explicit;
      input = explicit;
    }

    var start = input.offset;

    // Unwrap implicit and normal values
    if (state.use === null && state.choice === null) {
      var _save = void 0;
      if (state.any) _save = input.save();
      var body = this._decodeTag(input, state.implicit !== null ? state.implicit : state.tag, state.any);
      if (input.isError(body)) return body;

      if (state.any) result = input.raw(_save);else input = body;
    }

    if (options && options.track && state.tag !== null) options.track(input.path(), start, input.length, 'tagged');

    if (options && options.track && state.tag !== null) options.track(input.path(), input.offset, input.length, 'content');

    // Select proper method for tag
    if (state.any) {
      // no-op
    } else if (state.choice === null) {
      result = this._decodeGeneric(state.tag, input, options);
    } else {
      result = this._decodeChoice(input, options);
    }

    if (input.isError(result)) return result;

    // Decode children
    if (!state.any && state.choice === null && state.children !== null) {
      state.children.forEach(function decodeChildren(child) {
        // NOTE: We are ignoring errors here, to let parser continue with other
        // parts of encoded data
        child._decode(input, options);
      });
    }

    // Decode contained/encoded by schema, only in bit or octet strings
    if (state.contains && (state.tag === 'octstr' || state.tag === 'bitstr')) {
      var data = new DecoderBuffer(result);
      result = this._getUse(state.contains, input._reporterState.obj)._decode(data, options);
    }
  }

  // Pop object
  if (state.obj && present) result = input.leaveObject(prevObj);

  // Set key
  if (state.key !== null && (result !== null || present === true)) input.leaveKey(prevKey, state.key, result);else if (prevKey !== null) input.exitKey(prevKey);

  return result;
};

Node.prototype._decodeGeneric = function decodeGeneric(tag, input, options) {
  var state = this._baseState;

  if (tag === 'seq' || tag === 'set') return null;
  if (tag === 'seqof' || tag === 'setof') return this._decodeList(input, tag, state.args[0], options);else if (/str$/.test(tag)) return this._decodeStr(input, tag, options);else if (tag === 'objid' && state.args) return this._decodeObjid(input, state.args[0], state.args[1], options);else if (tag === 'objid') return this._decodeObjid(input, null, null, options);else if (tag === 'gentime' || tag === 'utctime') return this._decodeTime(input, tag, options);else if (tag === 'null_') return this._decodeNull(input, options);else if (tag === 'bool') return this._decodeBool(input, options);else if (tag === 'objDesc') return this._decodeStr(input, tag, options);else if (tag === 'int' || tag === 'enum') return this._decodeInt(input, state.args && state.args[0], options);

  if (state.use !== null) {
    return this._getUse(state.use, input._reporterState.obj)._decode(input, options);
  } else {
    return input.error('unknown tag: ' + tag);
  }
};

Node.prototype._getUse = function _getUse(entity, obj) {
  var state = this._baseState;
  // Create altered use decoder if implicit is set
  state.useDecoder = this._use(entity, obj);
  assert(state.useDecoder._baseState.parent === null);
  state.useDecoder = state.useDecoder._baseState.children[0];
  if (state.implicit !== state.useDecoder._baseState.implicit) {
    state.useDecoder = state.useDecoder.clone();
    state.useDecoder._baseState.implicit = state.implicit;
  }
  return state.useDecoder;
};

Node.prototype._decodeChoice = function decodeChoice(input, options) {
  var state = this._baseState;
  var result = null;
  var match = false;

  Object.keys(state.choice).some(function (key) {
    var save = input.save();
    var node = state.choice[key];
    try {
      var value = node._decode(input, options);
      if (input.isError(value)) return false;

      result = { type: key, value: value };
      match = true;
    } catch (e) {
      input.restore(save);
      return false;
    }
    return true;
  }, this);

  if (!match) return input.error('Choice not matched');

  return result;
};

//
// Encoding
//

Node.prototype._createEncoderBuffer = function createEncoderBuffer(data) {
  return new EncoderBuffer(data, this.reporter);
};

Node.prototype._encode = function encode(data, reporter, parent) {
  var state = this._baseState;
  if (state['default'] !== null && state['default'] === data) return;

  var result = this._encodeValue(data, reporter, parent);
  if (result === undefined) return;

  if (this._skipDefault(result, reporter, parent)) return;

  return result;
};

Node.prototype._encodeValue = function encode(_data, reporter, parent) {
  var state = this._baseState;
  var data = _data;

  // Decode root node
  if (state.parent === null) return state.children[0]._encode(data, reporter || new Reporter());

  var result = null;

  // Set reporter to share it with a child class
  this.reporter = reporter;

  // Check if data is there
  if (state.optional && data === undefined) {
    if (state['default'] !== null) data = state['default'];else return;
  }

  // Encode children first
  var content = null;
  var primitive = false;
  if (state.any) {
    // Anything that was given is translated to buffer
    result = this._createEncoderBuffer(data);
  } else if (state.choice) {
    result = this._encodeChoice(data, reporter);
  } else if (state.contains) {
    content = this._getUse(state.contains, parent)._encode(data, reporter);
    primitive = true;
  } else if (state.children) {
    content = state.children.map(function (child) {
      if (child._baseState.tag === 'null_') return child._encode(null, reporter, data);

      if (child._baseState.key === null) return reporter.error('Child should have a key');
      var prevKey = reporter.enterKey(child._baseState.key);

      if ((typeof data === 'undefined' ? 'undefined' : _typeof(data)) !== 'object') return reporter.error('Child expected, but input is not object');

      var res = child._encode(data[child._baseState.key], reporter, data);
      reporter.leaveKey(prevKey);

      return res;
    }, this).filter(function (child) {
      return child;
    });
    content = this._createEncoderBuffer(content);
  } else {
    if (state.tag === 'seqof' || state.tag === 'setof') {
      // TODO(indutny): this should be thrown on DSL level
      if (!(state.args && state.args.length === 1)) return reporter.error('Too many args for : ' + state.tag);

      if (!Array.isArray(data)) return reporter.error('seqof/setof, but data is not Array');

      var child = this.clone();
      child._baseState.implicit = null;
      content = this._createEncoderBuffer(data.map(function (item) {
        var state = this._baseState;

        return this._getUse(state.args[0], data)._encode(item, reporter);
      }, child));
    } else if (state.use !== null) {
      result = this._getUse(state.use, parent)._encode(data, reporter);
    } else {
      content = this._encodePrimitive(state.tag, data);
      primitive = true;
    }
  }

  // Encode data itself
  if (!state.any && state.choice === null) {
    var tag = state.implicit !== null ? state.implicit : state.tag;
    var cls = state.implicit === null ? 'universal' : 'context';

    if (tag === null) {
      if (state.use === null) reporter.error('Tag could be omitted only for .use()');
    } else {
      if (state.use === null) result = this._encodeComposite(tag, primitive, cls, content);
    }
  }

  // Wrap in explicit
  if (state.explicit !== null) result = this._encodeComposite(state.explicit, false, 'context', result);

  return result;
};

Node.prototype._encodeChoice = function encodeChoice(data, reporter) {
  var state = this._baseState;

  var node = state.choice[data.type];
  if (!node) {
    assert(false, data.type + ' not found in ' + JSON.stringify(Object.keys(state.choice)));
  }
  return node._encode(data.value, reporter);
};

Node.prototype._encodePrimitive = function encodePrimitive(tag, data) {
  var state = this._baseState;

  if (/str$/.test(tag)) return this._encodeStr(data, tag);else if (tag === 'objid' && state.args) return this._encodeObjid(data, state.reverseArgs[0], state.args[1]);else if (tag === 'objid') return this._encodeObjid(data, null, null);else if (tag === 'gentime' || tag === 'utctime') return this._encodeTime(data, tag);else if (tag === 'null_') return this._encodeNull();else if (tag === 'int' || tag === 'enum') return this._encodeInt(data, state.args && state.reverseArgs[0]);else if (tag === 'bool') return this._encodeBool(data);else if (tag === 'objDesc') return this._encodeStr(data, tag);else throw new Error('Unsupported tag: ' + tag);
};

Node.prototype._isNumstr = function isNumstr(str) {
  return (/^[0-9 ]*$/.test(str)
  );
};

Node.prototype._isPrintstr = function isPrintstr(str) {
  return (/^[A-Za-z0-9 '()+,-./:=?]*$/.test(str)
  );
};



var index = /*#__PURE__*/Object.freeze({
  Node: Node,
  Reporter: Reporter,
  EncoderBuffer: EncoderBuffer,
  DecoderBuffer: DecoderBuffer
});

// Helper

var _reverse = function _reverse(map) {
  var res = {};

  Object.keys(map).forEach(function (_key) {
    // Convert key to integer if it is stringified
    var key = _key;
    if ((key | 0) == key) key = key | 0;

    var value = map[key];
    res[value] = key;
  });

  return res;
};

var tagClass = {
  0: 'universal',
  1: 'application',
  2: 'context',
  3: 'private'
};
var tagClassByName = _reverse(tagClass);

var tag = {
  0x00: 'end',
  0x01: 'bool',
  0x02: 'int',
  0x03: 'bitstr',
  0x04: 'octstr',
  0x05: 'null_',
  0x06: 'objid',
  0x07: 'objDesc',
  0x08: 'external',
  0x09: 'real',
  0x0a: 'enum',
  0x0b: 'embed',
  0x0c: 'utf8str',
  0x0d: 'relativeOid',
  0x10: 'seq',
  0x11: 'set',
  0x12: 'numstr',
  0x13: 'printstr',
  0x14: 't61str',
  0x15: 'videostr',
  0x16: 'ia5str',
  0x17: 'utctime',
  0x18: 'gentime',
  0x19: 'graphstr',
  0x1a: 'iso646str',
  0x1b: 'genstr',
  0x1c: 'unistr',
  0x1d: 'charstr',
  0x1e: 'bmpstr'
};
var tagByName = _reverse(tag);

var der = /*#__PURE__*/Object.freeze({
  tagClass: tagClass,
  tagClassByName: tagClassByName,
  tag: tag,
  tagByName: tagByName
});



var index$1 = /*#__PURE__*/Object.freeze({
  der: der
});

function DEREncoder(entity) {
  this.enc = 'der';
  this.name = entity.name;
  this.entity = entity;

  // Construct base tree
  this.tree = new DERNode();
  this.tree._init(entity.body);
}

DEREncoder.prototype.encode = function encode(data, reporter) {
  return this.tree._encode(data, reporter).join();
};

// Tree methods

function DERNode(parent) {
  Node.call(this, 'der', parent);
}
inherits(DERNode, Node);

DERNode.prototype._encodeComposite = function encodeComposite(tag$$1, primitive, cls, content) {
  var encodedTag = encodeTag(tag$$1, primitive, cls, this.reporter);

  // Short form
  if (content.length < 0x80) {
    var _header = new Buffer(2);
    _header[0] = encodedTag;
    _header[1] = content.length;
    return this._createEncoderBuffer([_header, content]);
  }

  // Long form
  // Count octets required to store length
  var lenOctets = 1;
  for (var i = content.length; i >= 0x100; i >>= 8) {
    lenOctets++;
  }var header = new Buffer(1 + 1 + lenOctets);
  header[0] = encodedTag;
  header[1] = 0x80 | lenOctets;

  for (var _i = 1 + lenOctets, j = content.length; j > 0; _i--, j >>= 8) {
    header[_i] = j & 0xff;
  }return this._createEncoderBuffer([header, content]);
};

DERNode.prototype._encodeStr = function encodeStr(str, tag$$1) {
  if (tag$$1 === 'bitstr') {
    return this._createEncoderBuffer([str.unused | 0, str.data]);
  } else if (tag$$1 === 'bmpstr') {
    var buf = new Buffer(str.length * 2);
    for (var i = 0; i < str.length; i++) {
      buf.writeUInt16BE(str.charCodeAt(i), i * 2);
    }
    return this._createEncoderBuffer(buf);
  } else if (tag$$1 === 'numstr') {
    if (!this._isNumstr(str)) {
      return this.reporter.error('Encoding of string type: numstr supports ' + 'only digits and space');
    }
    return this._createEncoderBuffer(str);
  } else if (tag$$1 === 'printstr') {
    if (!this._isPrintstr(str)) {
      return this.reporter.error('Encoding of string type: printstr supports ' + 'only latin upper and lower case letters, ' + 'digits, space, apostrophe, left and rigth ' + 'parenthesis, plus sign, comma, hyphen, ' + 'dot, slash, colon, equal sign, ' + 'question mark');
    }
    return this._createEncoderBuffer(str);
  } else if (/str$/.test(tag$$1)) {
    return this._createEncoderBuffer(str);
  } else if (tag$$1 === 'objDesc') {
    return this._createEncoderBuffer(str);
  } else {
    return this.reporter.error('Encoding of string type: ' + tag$$1 + ' unsupported');
  }
};

DERNode.prototype._encodeObjid = function encodeObjid(_id, values, relative) {
  var id = _id;
  if (typeof id === 'string') {
    if (!values) return this.reporter.error('string objid given, but no values map found');
    if (!values.hasOwnProperty(id)) return this.reporter.error('objid not found in values map');
    id = values[id].split(/[\s.]+/g);
    for (var i = 0; i < id.length; i++) {
      id[i] |= 0;
    }
  } else if (Array.isArray(id)) {
    id = id.slice();
    for (var _i2 = 0; _i2 < id.length; _i2++) {
      id[_i2] |= 0;
    }
  }

  if (!Array.isArray(id)) {
    return this.reporter.error('objid() should be either array or string, ' + 'got: ' + JSON.stringify(id));
  }

  if (!relative) {
    if (id[1] >= 40) return this.reporter.error('Second objid identifier OOB');
    id.splice(0, 2, id[0] * 40 + id[1]);
  }

  // Count number of octets
  var size = 0;
  for (var _i3 = 0; _i3 < id.length; _i3++) {
    var ident = id[_i3];
    for (size++; ident >= 0x80; ident >>= 7) {
      size++;
    }
  }

  var objid = new Buffer(size);
  var offset = objid.length - 1;
  for (var _i4 = id.length - 1; _i4 >= 0; _i4--) {
    var _ident = id[_i4];
    objid[offset--] = _ident & 0x7f;
    while ((_ident >>= 7) > 0) {
      objid[offset--] = 0x80 | _ident & 0x7f;
    }
  }

  return this._createEncoderBuffer(objid);
};

function two(num) {
  if (num < 10) return '0' + num;else return num;
}

DERNode.prototype._encodeTime = function encodeTime(time, tag$$1) {
  var str = void 0;
  var date = new Date(time);

  if (tag$$1 === 'gentime') {
    str = [two(date.getFullYear()), two(date.getUTCMonth() + 1), two(date.getUTCDate()), two(date.getUTCHours()), two(date.getUTCMinutes()), two(date.getUTCSeconds()), 'Z'].join('');
  } else if (tag$$1 === 'utctime') {
    str = [two(date.getFullYear() % 100), two(date.getUTCMonth() + 1), two(date.getUTCDate()), two(date.getUTCHours()), two(date.getUTCMinutes()), two(date.getUTCSeconds()), 'Z'].join('');
  } else {
    this.reporter.error('Encoding ' + tag$$1 + ' time is not supported yet');
  }

  return this._encodeStr(str, 'octstr');
};

DERNode.prototype._encodeNull = function encodeNull() {
  return this._createEncoderBuffer('');
};

DERNode.prototype._encodeInt = function encodeInt(_num, values) {
  var num = _num;
  if (typeof num === 'string') {
    if (!values) return this.reporter.error('String int or enum given, but no values map');
    if (!values.hasOwnProperty(num)) {
      return this.reporter.error("Values map doesn't contain: " + JSON.stringify(num));
    }
    num = values[num];
  }

  // Bignum, assume big endian
  if (typeof num !== 'number' && !Buffer.isBuffer(num)) {
    var numArray = num.toArray();
    if (!num.sign && numArray[0] & 0x80) {
      numArray.unshift(0);
    }
    num = new Buffer(numArray);
  }

  if (Buffer.isBuffer(num)) {
    var _size = num.length;
    if (num.length === 0) _size++;

    var _out = new Buffer(_size);
    num.copy(_out);
    if (num.length === 0) _out[0] = 0;
    return this._createEncoderBuffer(_out);
  }

  if (num < 0x80) return this._createEncoderBuffer(num);

  if (num < 0x100) return this._createEncoderBuffer([0, num]);

  var size = 1;
  for (var i = num; i >= 0x100; i >>= 8) {
    size++;
  }var out = new Array(size);
  for (var _i5 = out.length - 1; _i5 >= 0; _i5--) {
    out[_i5] = num & 0xff;
    num >>= 8;
  }
  if (out[0] & 0x80) {
    out.unshift(0);
  }

  return this._createEncoderBuffer(new Buffer(out));
};

DERNode.prototype._encodeBool = function encodeBool(value) {
  return this._createEncoderBuffer(value ? 0xff : 0);
};

DERNode.prototype._use = function use(_entity, obj) {
  var entity = _entity;
  if (typeof entity === 'function') entity = entity(obj);
  return entity._getEncoder('der').tree;
};

DERNode.prototype._skipDefault = function skipDefault(dataBuffer, reporter, parent) {
  var state = this._baseState;
  var i = void 0;
  if (state['default'] === null) return false;

  var data = dataBuffer.join();
  if (state.defaultBuffer === undefined) state.defaultBuffer = this._encodeValue(state['default'], reporter, parent).join();

  if (data.length !== state.defaultBuffer.length) return false;

  for (i = 0; i < data.length; i++) {
    if (data[i] !== state.defaultBuffer[i]) return false;
  }return true;
};

// Utility methods

function encodeTag(_tag, primitive, cls, reporter) {
  var tag$$1 = _tag;
  var res = void 0;

  if (tag$$1 === 'seqof') tag$$1 = 'seq';else if (tag$$1 === 'setof') tag$$1 = 'set';

  if (tagByName.hasOwnProperty(tag$$1)) res = tagByName[tag$$1];else if (typeof tag$$1 === 'number' && (tag$$1 | 0) === tag$$1) res = tag$$1;else return reporter.error('Unknown tag: ' + tag$$1);

  if (res >= 0x1f) return reporter.error('Multi-octet tag encoding unsupported');

  if (!primitive) res |= 0x20;

  res |= tagClassByName[cls || 'universal'] << 6;

  return res;
}

function PEMEncoder(entity) {
  DEREncoder.call(this, entity);
  this.enc = 'pem';
}
inherits(PEMEncoder, DEREncoder);

PEMEncoder.prototype.encode = function encode(data, options) {
  var buf = DEREncoder.prototype.encode.call(this, data);

  var p = buf.toString('base64');
  var out = ['-----BEGIN ' + options.label + '-----'];
  for (var i = 0; i < p.length; i += 64) {
    out.push(p.slice(i, i + 64));
  }out.push('-----END ' + options.label + '-----');
  return out.join('\n');
};



var encoders = /*#__PURE__*/Object.freeze({
  der: DEREncoder,
  pem: PEMEncoder
});

function DERDecoder(entity) {
  this.enc = 'der';
  this.name = entity.name;
  this.entity = entity;

  // Construct base tree
  this.tree = new DERNode$1();
  this.tree._init(entity.body);
}

DERDecoder.prototype.decode = function decode(_data, options) {
  var data = _data;
  if (!(data instanceof DecoderBuffer)) data = new DecoderBuffer(data, options);

  return this.tree._decode(data, options);
};

// Tree methods

function DERNode$1(parent) {
  Node.call(this, 'der', parent);
}
inherits(DERNode$1, Node);

DERNode$1.prototype._peekTag = function peekTag(buffer, tag$$1, any) {
  if (buffer.isEmpty()) return false;

  var state = buffer.save();
  var decodedTag = derDecodeTag(buffer, 'Failed to peek tag: "' + tag$$1 + '"');
  if (buffer.isError(decodedTag)) return decodedTag;

  buffer.restore(state);

  return decodedTag.tag === tag$$1 || decodedTag.tagStr === tag$$1 || decodedTag.tagStr + 'of' === tag$$1 || any;
};

DERNode$1.prototype._decodeTag = function decodeTag(buffer, tag$$1, any) {
  var decodedTag = derDecodeTag(buffer, 'Failed to decode tag of "' + tag$$1 + '"');
  if (buffer.isError(decodedTag)) return decodedTag;

  var len = derDecodeLen(buffer, decodedTag.primitive, 'Failed to get length of "' + tag$$1 + '"');

  // Failure
  if (buffer.isError(len)) return len;

  if (!any && decodedTag.tag !== tag$$1 && decodedTag.tagStr !== tag$$1 && decodedTag.tagStr + 'of' !== tag$$1) {
    return buffer.error('Failed to match tag: "' + tag$$1 + '"');
  }

  if (decodedTag.primitive || len !== null) return buffer.skip(len, 'Failed to match body of: "' + tag$$1 + '"');

  // Indefinite length... find END tag
  var state = buffer.save();
  var res = this._skipUntilEnd(buffer, 'Failed to skip indefinite length body: "' + this.tag + '"');
  if (buffer.isError(res)) return res;

  len = buffer.offset - state.offset;
  buffer.restore(state);
  return buffer.skip(len, 'Failed to match body of: "' + tag$$1 + '"');
};

DERNode$1.prototype._skipUntilEnd = function skipUntilEnd(buffer, fail) {
  for (;;) {
    var tag$$1 = derDecodeTag(buffer, fail);
    if (buffer.isError(tag$$1)) return tag$$1;
    var len = derDecodeLen(buffer, tag$$1.primitive, fail);
    if (buffer.isError(len)) return len;

    var res = void 0;
    if (tag$$1.primitive || len !== null) res = buffer.skip(len);else res = this._skipUntilEnd(buffer, fail);

    // Failure
    if (buffer.isError(res)) return res;

    if (tag$$1.tagStr === 'end') break;
  }
};

DERNode$1.prototype._decodeList = function decodeList(buffer, tag$$1, decoder, options) {
  var result = [];
  while (!buffer.isEmpty()) {
    var possibleEnd = this._peekTag(buffer, 'end');
    if (buffer.isError(possibleEnd)) return possibleEnd;

    var res = decoder.decode(buffer, 'der', options);
    if (buffer.isError(res) && possibleEnd) break;
    result.push(res);
  }
  return result;
};

DERNode$1.prototype._decodeStr = function decodeStr(buffer, tag$$1) {
  if (tag$$1 === 'bitstr') {
    var unused = buffer.readUInt8();
    if (buffer.isError(unused)) return unused;
    return { unused: unused, data: buffer.raw() };
  } else if (tag$$1 === 'bmpstr') {
    var raw = buffer.raw();
    if (raw.length % 2 === 1) return buffer.error('Decoding of string type: bmpstr length mismatch');

    var str = '';
    for (var i = 0; i < raw.length / 2; i++) {
      str += String.fromCharCode(raw.readUInt16BE(i * 2));
    }
    return str;
  } else if (tag$$1 === 'numstr') {
    var numstr = buffer.raw().toString('ascii');
    if (!this._isNumstr(numstr)) {
      return buffer.error('Decoding of string type: ' + 'numstr unsupported characters');
    }
    return numstr;
  } else if (tag$$1 === 'octstr') {
    return buffer.raw();
  } else if (tag$$1 === 'objDesc') {
    return buffer.raw();
  } else if (tag$$1 === 'printstr') {
    var printstr = buffer.raw().toString('ascii');
    if (!this._isPrintstr(printstr)) {
      return buffer.error('Decoding of string type: ' + 'printstr unsupported characters');
    }
    return printstr;
  } else if (/str$/.test(tag$$1)) {
    return buffer.raw().toString();
  } else {
    return buffer.error('Decoding of string type: ' + tag$$1 + ' unsupported');
  }
};

DERNode$1.prototype._decodeObjid = function decodeObjid(buffer, values, relative) {
  var result = void 0;
  var identifiers = [];
  var ident = 0;
  var subident = 0;
  while (!buffer.isEmpty()) {
    subident = buffer.readUInt8();
    ident <<= 7;
    ident |= subident & 0x7f;
    if ((subident & 0x80) === 0) {
      identifiers.push(ident);
      ident = 0;
    }
  }
  if (subident & 0x80) identifiers.push(ident);

  var first = identifiers[0] / 40 | 0;
  var second = identifiers[0] % 40;

  if (relative) result = identifiers;else result = [first, second].concat(identifiers.slice(1));

  if (values) {
    var tmp = values[result.join(' ')];
    if (tmp === undefined) tmp = values[result.join('.')];
    if (tmp !== undefined) result = tmp;
  }

  return result;
};

DERNode$1.prototype._decodeTime = function decodeTime(buffer, tag$$1) {
  var str = buffer.raw().toString();

  var year = void 0;
  var mon = void 0;
  var day = void 0;
  var hour = void 0;
  var min = void 0;
  var sec = void 0;
  if (tag$$1 === 'gentime') {
    year = str.slice(0, 4) | 0;
    mon = str.slice(4, 6) | 0;
    day = str.slice(6, 8) | 0;
    hour = str.slice(8, 10) | 0;
    min = str.slice(10, 12) | 0;
    sec = str.slice(12, 14) | 0;
  } else if (tag$$1 === 'utctime') {
    year = str.slice(0, 2) | 0;
    mon = str.slice(2, 4) | 0;
    day = str.slice(4, 6) | 0;
    hour = str.slice(6, 8) | 0;
    min = str.slice(8, 10) | 0;
    sec = str.slice(10, 12) | 0;
    if (year < 70) year = 2000 + year;else year = 1900 + year;
  } else {
    return buffer.error('Decoding ' + tag$$1 + ' time is not supported yet');
  }

  return Date.UTC(year, mon - 1, day, hour, min, sec, 0);
};

DERNode$1.prototype._decodeNull = function decodeNull() {
  return null;
};

DERNode$1.prototype._decodeBool = function decodeBool(buffer) {
  var res = buffer.readUInt8();
  if (buffer.isError(res)) return res;else return res !== 0;
};

DERNode$1.prototype._decodeInt = function decodeInt(buffer, values) {
  // Bigint, return as it is (assume big endian)
  var raw = buffer.raw();
  var res = new bignum(raw);

  if (values) res = values[res.toString(10)] || res;

  return res;
};

DERNode$1.prototype._use = function use(_entity, obj) {
  var entity = _entity;
  if (typeof entity === 'function') entity = entity(obj);
  return entity._getDecoder('der').tree;
};

// Utility methods

function derDecodeTag(buf, fail) {
  var tag$$1 = buf.readUInt8(fail);
  if (buf.isError(tag$$1)) return tag$$1;

  var cls = tagClass[tag$$1 >> 6];
  var primitive = (tag$$1 & 0x20) === 0;

  // Multi-octet tag - load
  if ((tag$$1 & 0x1f) === 0x1f) {
    var oct = tag$$1;
    tag$$1 = 0;
    while ((oct & 0x80) === 0x80) {
      oct = buf.readUInt8(fail);
      if (buf.isError(oct)) return oct;

      tag$$1 <<= 7;
      tag$$1 |= oct & 0x7f;
    }
  } else {
    tag$$1 &= 0x1f;
  }
  var tagStr = tag[tag$$1];

  return {
    cls: cls,
    primitive: primitive,
    tag: tag$$1,
    tagStr: tagStr
  };
}

function derDecodeLen(buf, primitive, fail) {
  var len = buf.readUInt8(fail);
  if (buf.isError(len)) return len;

  // Indefinite form
  if (!primitive && len === 0x80) return null;

  // Definite form
  if ((len & 0x80) === 0) {
    // Short form
    return len;
  }

  // Long form
  var num = len & 0x7f;
  if (num > 4) return buf.error('length octect is too long');

  len = 0;
  for (var i = 0; i < num; i++) {
    len <<= 8;
    var j = buf.readUInt8(fail);
    if (buf.isError(j)) return j;
    len |= j;
  }

  return len;
}

function PEMDecoder(entity) {
  DERDecoder.call(this, entity);
  this.enc = 'pem';
}
inherits(PEMDecoder, DERDecoder);

PEMDecoder.prototype.decode = function decode(data, options) {
  var lines = data.toString().split(/[\r\n]+/g);

  var label = options.label.toUpperCase();

  var re = /^-----(BEGIN|END) ([^-]+)-----$/;
  var start = -1;
  var end = -1;
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(re);
    if (match === null) continue;

    if (match[2] !== label) continue;

    if (start === -1) {
      if (match[1] !== 'BEGIN') break;
      start = i;
    } else {
      if (match[1] !== 'END') break;
      end = i;
      break;
    }
  }
  if (start === -1 || end === -1) throw new Error('PEM section not found for: ' + label);

  var base64 = lines.slice(start + 1, end).join('');
  // Remove excessive symbols
  base64.replace(/[^a-z0-9+/=]+/gi, '');

  var input = new Buffer(base64, 'base64');
  return DERDecoder.prototype.decode.call(this, input, options);
};



var decoders = /*#__PURE__*/Object.freeze({
  der: DERDecoder,
  pem: PEMDecoder
});

var define = function define(name, body) {
  return new Entity(name, body);
};

function Entity(name, body) {
  this.name = name;
  this.body = body;

  this.decoders = {};
  this.encoders = {};
}

Entity.prototype._createNamed = function createNamed(base) {
  var named = void 0;
  try {
    named = vm.runInThisContext('(function ' + this.name + '(entity) {\n' + '  this._initNamed(entity);\n' + '})');
  } catch (e) {
    named = function named(entity) {
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
  var encoding = enc || 'der';
  // Lazily create decoder
  if (!this.decoders.hasOwnProperty(encoding)) this.decoders[encoding] = this._createNamed(decoders[encoding]);
  return this.decoders[encoding];
};

Entity.prototype.decode = function decode(data, enc, options) {
  return this._getDecoder(enc).decode(data, options);
};

Entity.prototype._getEncoder = function _getEncoder(enc) {
  var encoding = enc || 'der';
  // Lazily create encoder
  if (!this.encoders.hasOwnProperty(encoding)) this.encoders[encoding] = this._createNamed(encoders[encoding]);
  return this.encoders[encoding];
};

Entity.prototype.encode = function encode(data, enc, /* internal */reporter) {
  return this._getEncoder(enc).encode(data, reporter);
};

exports.BigNumber = bignum;
exports.define = define;
exports.constants = index$1;
exports.base = index;
exports.encoders = encoders;
exports.decoders = decoders;

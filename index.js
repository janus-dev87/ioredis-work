'use strict';

exports = module.exports = require('./lib/redis');

exports.ReplyError = require('redis-errors').ReplyError;
exports.Cluster = require('./lib/cluster');
exports.Command = require('./lib/command');

var PromiseContainer = require('./lib/promise_container');
Object.defineProperty(exports, 'Promise', {
  get: function() {
    return PromiseContainer.get();
  },
  set: function(lib) {
    PromiseContainer.set(lib);
  }
});

exports.print = function (err, reply) {
  if (err) {
    console.log('Error: ' + err);
  } else {
    console.log('Reply: ' + reply);
  }
};

'use strict';

var net = require('net');
var util = require('util');
var utils = require('../../lib/utils');
var EventEmitter = require('events').EventEmitter;
var enableDestroy = require('server-destroy');
var Parser = require('redis-parser');

var createdMockServers = [];

afterEach(function (done) {
  if (createdMockServers.length === 0) {
    done();
    return;
  }
  var pending = 0;

  for (var i = 0; i < createdMockServers.length; ++i) {
    pending += 1;
    createdMockServers[i].disconnect(check);
  }

  function check() {
    if (!--pending) {
      createdMockServers = [];
      done();
    }
  }
});

function MockServer(port, handler, slotTable) {
  EventEmitter.call(this);

  this.port = port;
  this.handler = handler;
  this.slotTable = slotTable;

  this.clients = [];

  createdMockServers.push(this);

  this.connect();
}

util.inherits(MockServer, EventEmitter);

MockServer.prototype.connect = function () {
  var _this = this;
  this.socket = net.createServer(function (c) {
    c.getConnectionName = () => (c._connectionName)
    var clientIndex = _this.clients.push(c) - 1;
    process.nextTick(function () {
      _this.emit('connect', c);
    });

    var parser = new Parser({
      returnBuffers: true,
      returnReply: function (reply) {
        reply = utils.convertBufferToString(reply);
        if (reply.length === 3 && reply[0].toLowerCase() === 'client' && reply[1].toLowerCase() === 'setname') {
          c._connectionName = reply[2]
        }
        if (_this.slotTable && reply.length === 2 && reply[0].toLowerCase() === 'cluster' && reply[1].toLowerCase() === 'slots') {
          _this.write(c, _this.slotTable)
          return
        }
        _this.write(c, _this.handler && _this.handler(reply, c));
      },
      returnError: function () { }
    });

    c.on('end', function () {
      _this.clients[clientIndex] = null;
      _this.emit('disconnect', c);
    });

    c.on('data', function (data) {
      parser.execute(data);
    });
  });

  this.socket.listen(this.port);
  enableDestroy(this.socket);
};

MockServer.prototype.disconnect = function (callback) {
  this.socket.destroy(callback);
};

MockServer.prototype.broadcast = function (data) {
  for (var i = 0; i < this.clients.length; ++i) {
    if (this.clients[i]) {
      this.write(this.clients[i], data);
    }
  }
};

MockServer.prototype.write = function (c, data) {
  if (c.writable) {
    c.write(convert('', data));
  }

  function convert(str, data) {
    var result;
    if (typeof data === 'undefined') {
      data = MockServer.REDIS_OK;
    }
    if (data === MockServer.REDIS_OK) {
      result = '+OK\r\n';
    } else if (data instanceof Error) {
      result = '-' + data.message + '\r\n';
    } else if (Array.isArray(data)) {
      result = '*' + data.length + '\r\n';
      data.forEach(function (item) {
        result += convert(str, item);
      });
    } else if (typeof data === 'number') {
      result = ':' + data + '\r\n';
    } else if (data === null) {
      result = '$-1\r\n';
    } else {
      data = data.toString();
      result = '$' + data.length + '\r\n';
      result += data + '\r\n';
    }
    return str + result;
  }
};

MockServer.prototype.findClientByName = function (name) {
  for (const client of this.clients) {
    if (client && client._connectionName === name) {
      return client
    }
  }
}

MockServer.REDIS_OK = '+OK';

module.exports = MockServer;

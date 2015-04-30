'use strict';

var _ = require('lodash');
var Command = require('../../command');
var SubscriptionSet = require('../../subscription_set');
var debug = require('debug')('ioredis:reply');

/**
 * Init the parser
 *
 * @method _initParser
 * @memberOf Redis#
 * @private
 */
exports.initParser = function () {
  var self = this;

  this.replyParser = new this.Parser({
    returnBuffers: true
  });

  // "reply error" is an error sent back by Redis
  this.replyParser.on('reply error', function (reply) {
    self.returnError(reply);
  });
  this.replyParser.on('reply', function (reply) {
    self.returnReply(reply);
  });
  this.replyParser.on('error', function (err) {
    self.emit('error', new Error('Redis reply parser error: ' + err.stack));
  });
};

exports.returnError = function (err) {
  var command = this.commandQueue.shift();

  err.command = {
    name: command.name,
    args: command.args
  };

  command.reject(err);
};

var sharedBuffers = {};
_.forEach(['message', 'pmessage', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe'], function (str) {
  sharedBuffers[str] = new Buffer(str);
});
exports.returnReply = function (reply) {
  if (this.condition.mode.monitoring) {
    // Valid commands in the monitoring mode are AUTH and MONITOR,
    // both of which always reply with 'OK'.
    var replyStr = reply.toString();

    // If not the reply to AUTH & MONITOR
    if (replyStr !== 'OK') {
      // Since commands sent in the monitoring mode will trigger an exception,
      // any replies we received in the monitoring mode should consider to be
      // realtime monitor data instead of result of commands.
      var len = replyStr.indexOf(' ');
      var timestamp = replyStr.slice(0, len);
      var argindex = replyStr.indexOf('"');
      var args = replyStr.slice(argindex + 1, -1).split('" "').map(function (elem) {
        return elem.replace(/\\"/g, '"');
      });
      this.emit('monitor', timestamp, args);
      return;
    }
  }

  var command, channel, count;
  if (this.condition.mode.subscriber) {
    var replyType = Array.isArray(reply) ? reply[0].toString() : null;
    debug('receive reply "%s" in subscriber mode', replyType);

    switch (replyType) {
      case 'message':
        if (this.listeners('message').length > 0) {
          this.emit('message', reply[1].toString(), reply[2].toString());
        }
        if (this.listeners('messageBuffer').length > 0) {
          this.emit('messageBuffer', reply[1], reply[2]);
        }
        break;
      case 'pmessage':
        var pattern = reply[1].toString();
        if (this.listeners('pmessage').length > 0) {
          this.emit('pmessage', pattern, reply[2].toString(), reply[3].toString());
        }
        if (this.listeners('pmessageBuffer').length > 0) {
          this.emit('pmessageBuffer', pattern, reply[2], reply[3]);
        }
        break;
      case 'subscribe':
      case 'psubscribe':
        channel = reply[1].toString();
        this.condition.mode.subscriber.add(replyType, channel);
        command = shiftCommand(this);
        if (!fillSubCommand(command, reply[2])) {
          this.commandQueue.unshift(command);
        }
        break;
      case 'unsubscribe':
      case 'punsubscribe':
        channel = reply[1] ? reply[1].toString() : null;
        if (channel) {
          this.condition.mode.subscriber.del(replyType, channel);
        }
        count = reply[2];
        if (count === 0) {
          this.condition.mode.subscriber = false;
        }
        command = shiftCommand(this);
        if (!fillUnsubCommand(command, count)) {
          this.commandQueue.unshift(command);
        }
        break;
      default:
        command = shiftCommand(this);
        command.resolve(reply);
    }
  } else {
    command = shiftCommand(this);
    if (!command) {
      return this.emit('error', new Error('Command queue state error. If you can reproduce this, please report it.'));
    }
    if (_.includes(Command.FLAGS.ENTER_SUBSCRIBER_MODE, command.name)) {
      this.condition.mode.subscriber = new SubscriptionSet();
      this.condition.mode.subscriber.add(command.name, reply[1].toString());

      if (!fillSubCommand(command, reply[2])) {
        this.commandQueue.unshift(command);
      }
    } else if (_.includes(Command.FLAGS.EXIT_SUBSCRIBER_MODE, command.name)) {
      if (!fillUnsubCommand(command, reply[2])) {
        this.commandQueue.unshift(command);
      }
    } else {
      command.resolve(reply);
    }
  }

  function shiftCommand(self) {
    var command = self.commandQueue.shift();
    return command;
  }

  function fillSubCommand(command, count) {
    if (typeof command.remainReplies === 'undefined') {
      command.remainReplies = command.args.length;
    }
    if (--command.remainReplies === 0) {
      command.resolve(count);
      return true;
    }
    return false;
  }

  function fillUnsubCommand(command, count) {
    if (typeof command.remainReplies === 'undefined') {
      command.remainReplies = command.args.length;
    }
    if (command.remainReplies === 0) {
      if (count === 0) {
        command.resolve(reply[2]);
        return true;
      }
      return false;
    }
    if (--command.remainReplies === 0) {
      command.resolve(reply[2]);
      return true;
    } else {
      return false;
    }
  }
};

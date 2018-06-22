var disconnect = require('./_helpers').disconnect;

describe('cluster:connect', function () {
  it('should flush the queue when all startup nodes are unreachable', function (done) {
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ], { clusterRetryStrategy: null });

    cluster.get('foo', function (err) {
      expect(err.message).to.match(/None of startup nodes is available/);
      cluster.disconnect();
      done();
    });
  });

  it('should invoke clusterRetryStrategy when all startup nodes are unreachable', function (done) {
    var t = 0;
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' },
      { host: '127.0.0.1', port: '30002' }
    ], {
      clusterRetryStrategy: function (times) {
        expect(times).to.eql(++t);
        if (times === 3) {
          return;
        }
        return 0;
      }
    });

    cluster.get('foo', function (err) {
      expect(t).to.eql(3);
      expect(err.message).to.match(/None of startup nodes is available/);
      cluster.disconnect();
      done();
    });
  });

  it('should invoke clusterRetryStrategy when none nodes are ready', function (done) {
    var argvHandler = function (argv) {
      if (argv[0] === 'cluster') {
        return new Error('CLUSTERDOWN');
      }
    };
    var node1 = new MockServer(30001, argvHandler);
    var node2 = new MockServer(30002, argvHandler);

    var t = 0;
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' },
      { host: '127.0.0.1', port: '30002' }
    ], {
      clusterRetryStrategy: function (times) {
        expect(times).to.eql(++t);
        if (times === 3) {
          cluster.disconnect();
          disconnect([node1, node2], done);
          return;
        }
        return 0;
      }
    });
  });

  it('should connect to cluster successfully', function (done) {
    var node = new MockServer(30001);

    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ]);

    node.once('connect', function () {
      cluster.disconnect();
      disconnect([node], done);
    });
  });

  it('should support url schema', function (done) {
    var node = new MockServer(30001);

    var cluster = new Redis.Cluster([
      'redis://127.0.0.1:30001'
    ]);

    node.once('connect', function () {
      cluster.disconnect();
      disconnect([node], done);
    });
  });

  it('should support a single port', function (done) {
    var node = new MockServer(30001);

    var cluster = new Redis.Cluster([30001]);

    node.once('connect', function () {
      cluster.disconnect();
      disconnect([node], done);
    });
  });

  it('should return a promise to be resolved when connected', function (done) {
    var slotTable = [
      [0, 5460, ['127.0.0.1', 30001]],
      [5461, 10922, ['127.0.0.1', 30002]],
      [10923, 16383, ['127.0.0.1', 30003]]
    ];
    var argvHandler = function (argv) {
      if (argv[0] === 'cluster' && argv[1] === 'slots') {
        return slotTable;
      }
    };
    var node1 = new MockServer(30001, argvHandler);
    var node2 = new MockServer(30002, argvHandler);
    var node3 = new MockServer(30003, argvHandler);

    stub(Redis.Cluster.prototype, 'connect', function () {
      return Promise.resolve();
    });
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ], { lazyConnect: false });
    Redis.Cluster.prototype.connect.restore();

    cluster.connect().then(function () {
      cluster.disconnect();
      disconnect([node1, node2, node3], done);
    });
  });

  it('should return a promise to be rejected when closed', function (done) {
    stub(Redis.Cluster.prototype, 'connect', function () {
      return Promise.resolve();
    });
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ], { lazyConnect: false });
    Redis.Cluster.prototype.connect.restore();

    cluster.connect().catch(function () {
      cluster.disconnect();
      done();
    });
  });

  it('should stop reconnecting when disconnected', function (done) {
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ], {
      clusterRetryStrategy: function () {
        return 0;
      }
    });

    cluster.on('close', function () {
      cluster.disconnect();
      stub(Redis.Cluster.prototype, 'connect').throws(new Error('`connect` should not be called'));
      setTimeout(function () {
        Redis.Cluster.prototype.connect.restore();
        done();
      }, 1);
    });
  });

  it('should discover other nodes automatically', function (done) {
    var slotTable = [
      [0, 5460, ['127.0.0.1', 30001]],
      [5461, 10922, ['127.0.0.1', 30002]],
      [10923, 16383, ['127.0.0.1', 30003]]
    ];
    var argvHandler = function (argv) {
      if (argv[0] === 'cluster' && argv[1] === 'slots') {
        return slotTable;
      }
    };
    var node1 = new MockServer(30001, argvHandler);
    var node2 = new MockServer(30002, argvHandler);
    var node3 = new MockServer(30003, argvHandler);

    var pending = 3;
    node1.once('connect', check);
    node2.once('connect', check);
    node3.once('connect', check);

    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ], { redisOptions: { lazyConnect: false } });

    function check() {
      if (!--pending) {
        cluster.disconnect();
        disconnect([node1, node2, node3], done);
      }
    }
  });

  it('should send command to the correct node', function (done) {
    var node1 = new MockServer(30001, function (argv) {
      if (argv[0] === 'cluster' && argv[1] === 'slots') {
        return [
          [0, 1, ['127.0.0.1', 30001]],
          [2, 16383, ['127.0.0.1', 30002]]
        ];
      }
    });
    var node2 = new MockServer(30002, function (argv) {
      if (argv[0] === 'get' && argv[1] === 'foo') {
        process.nextTick(function () {
          cluster.disconnect();
          disconnect([node1, node2], done);
        });
      }
    });

    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' }
    ], { lazyConnect: false });
    cluster.get('foo');
  });

  it('should emit errors when cluster cannot be connected', function (done) {
    var errorMessage = 'ERR This instance has cluster support disabled';
    var argvHandler = function (argv) {
      if (argv[0] === 'cluster' && argv[1] === 'slots') {
        return new Error(errorMessage);
      }
    };
    var node1 = new MockServer(30001, argvHandler);
    var node2 = new MockServer(30002, argvHandler);

    var pending = 2;
    var retry = 0;
    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001' },
      { host: '127.0.0.1', port: '30002' }
    ], {
      clusterRetryStrategy: function () {
        cluster.once('error', function (err) {
          retry = false;
          expect(err.message).to.eql('Failed to refresh slots cache.');
          expect(err.lastNodeError.message).to.eql(errorMessage);
          checkDone();
        });
        return retry;
      }
    });

    cluster.once('node error', function (err) {
      expect(err.message).to.eql(errorMessage);
      checkDone();
    });
    function checkDone() {
      if (!--pending) {
        cluster.disconnect();
        disconnect([node1, node2], done);
      }
    }
  });

  it('should using the specified password', function (done) {
    var node1, node2, node3;
    var slotTable = [
      [0, 5460, ['127.0.0.1', 30001]],
      [5461, 10922, ['127.0.0.1', 30002]],
      [10923, 16383, ['127.0.0.1', 30003]]
    ];
    var argvHandler = function (port, argv) {
      if (argv[0] === 'cluster' && argv[1] === 'slots') {
        return slotTable;
      }
      if (argv[0] === 'auth') {
        var password = argv[1];
        if (port === 30001) {
          expect(password).to.eql('other password');
        } else if (port === 30002) {
          throw new Error('30002 got password');
        } else if (port === 30003) {
          expect(password).to.eql('default password');
          cluster.disconnect();
          disconnect([node1, node2, node3], done);
        }
      }
    };
    node1 = new MockServer(30001, argvHandler.bind(null, 30001));
    node2 = new MockServer(30002, argvHandler.bind(null, 30002));
    node3 = new MockServer(30003, argvHandler.bind(null, 30003));

    var cluster = new Redis.Cluster([
      { host: '127.0.0.1', port: '30001', password: 'other password' },
      { host: '127.0.0.1', port: '30002', password: null }
    ], { redisOptions: { lazyConnect: false, password: 'default password' } });
  });
});

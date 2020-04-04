import Redis from "../../lib/redis";
import { expect } from "chai";
import * as sinon from "sinon";

describe("monitor", function () {
  it("should receive commands", function (done) {
    const redis = new Redis();
    redis.on("ready", function () {
      redis.monitor(function (err, monitor) {
        if (err) {
          done(err);
          return;
        }
        monitor.on("monitor", function (time, args) {
          expect(args[0]).to.eql("get");
          expect(args[1]).to.eql("foo");
          redis.disconnect();
          monitor.disconnect();
          done();
        });
        redis.get("foo");
      });
    });
  });

  it("should reject processing commands", function (done) {
    const redis = new Redis();
    redis.monitor(function (err, monitor) {
      monitor.get("foo", function (err) {
        expect(err.message).to.match(/Connection is in monitoring mode/);
        redis.disconnect();
        monitor.disconnect();
        done();
      });
    });
  });

  it("should continue monitoring after reconnection", function (done) {
    const redis = new Redis();
    redis.monitor(function (err, monitor) {
      if (err) {
        done(err);
        return;
      }
      monitor.on("monitor", function (time, args) {
        if (args[0] === "set") {
          redis.disconnect();
          monitor.disconnect();
          done();
        }
      });
      monitor.disconnect(true);
      monitor.on("ready", function () {
        redis.set("foo", "bar");
      });
    });
  });

  it("should wait for the ready event before monitoring", function (done) {
    const redis = new Redis();
    redis.on("ready", function () {
      const readyCheck = sinon.spy(Redis.prototype, "_readyCheck");
      redis.monitor(function (err, monitor) {
        expect(readyCheck.callCount).to.eql(1);
        Redis.prototype._readyCheck.restore();
        redis.disconnect();
        monitor.disconnect();
        done();
      });
    });
  });
});

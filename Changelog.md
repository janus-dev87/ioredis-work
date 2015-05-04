## Changelog

### Master Branch

### v1.2.0 - May 4, 2015

* Add `autoResendUnfulfilledCommands` option.

### v1.1.4 - May 3, 2015

* Support get built-in commands.

### v1.1.3 - May 2, 2015

* Fix buffer supporting in pipeline. Thanks to [@AVVS](https://github.com/AVVS).

### v1.1.2 - May 2, 2015

* Fix error of sending command to wrong node when slot is 0.

### v1.1.1 - May 2, 2015

* Support Transaction and pipelining in cluster mode.

### v1.1.0 - May 1, 2015

* Support cluster auto reconnection.
* Add `maxRedirections` option to Cluster.
* Remove `roleRetryDelay` option in favor of `sentinelRetryStrategy`.
* Improve compatibility with node_redis.
* More stable sentinel connection.

### v1.0.13 - April 27, 2015

* Support SORT, ZUNIONSTORE and ZINTERSTORE in Cluster.

### v1.0.12 - April 27, 2015

* Support for defining custom commands in Cluster.
* Use native array instead of fastqueue for better performance.

### v1.0.11 - April 26, 2015

* Add `showFriendlyErrorStack` option for outputing friendly error stack.

### v1.0.10 - April 25, 2015

* Improve performance for calculating slots.

### v1.0.9 - April 25, 2015

* Support single node commands in cluster mode.

### v1.0.8 - April 25, 2015

* Add promise supports in Cluster.

### v1.0.7 - April 25, 2015

* Add `autoResubscribe` option to prevent auto re-subscribe.
* Add `Redis#end` for compatibility.
* Add `Redis.createClient`(was `Redis#createClient`).

### v1.0.6 - April 24, 2015

* Support setting connect timeout.

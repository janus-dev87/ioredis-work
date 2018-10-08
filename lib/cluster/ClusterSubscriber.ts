import {EventEmitter} from 'events'
import ConnectionPool from './ConnectionPool'
import {sample, noop} from '../utils/lodash'
import {getNodeKey} from './util'

const Redis = require('../redis')
const debug = require('../utils/debug')('ioredis:cluster:subscriber')

const SUBSCRIBER_CONNECTION_NAME = 'ioredisClusterSubscriber'

export default class ClusterSubscriber {
  private started: boolean = false
  private subscriber: any = null
  private lastActiveSubscriber: any

  constructor (private connectionPool: ConnectionPool, private emitter: EventEmitter) {
    this.connectionPool.on('-node', (_, key: string) => {
      if (!this.started || !this.subscriber) {
        return
      }
      if (getNodeKey(this.subscriber.options) === key) {
        debug('subscriber has left, selecting a new one...')
        this.selectSubscriber()
      }
    })
    this.connectionPool.on('+node', () => {
      if (!this.started || this.subscriber) {
        return
      }
      debug('a new node is discovered and there is no subscriber, selecting a new one...')
      this.selectSubscriber()
    })
  }

  getInstance (): any {
    return this.subscriber
  }

  private selectSubscriber () {
    const lastActiveSubscriber = this.lastActiveSubscriber

    // Disconnect the previous subscriber even if there
    // will not be a new one.
    if (lastActiveSubscriber) {
      lastActiveSubscriber.disconnect()
    }

    const sampleNode = sample(this.connectionPool.getNodes())
    if (!sampleNode) {
      debug('selecting subscriber failed since there is no node discovered in the cluster yet')
      this.subscriber = null
      return
    }

    const {port, host} = sampleNode.options
    debug('selected a subscriber %s:%s', host, port)

    // Create a specialized Redis connection for the subscription.
    // Note that auto reconnection is enabled here.
    // `enableReadyCheck` is disabled because subscription is allowed
    // when redis is loading data from the disk.
    this.subscriber = new Redis({
      port,
      host,
      enableReadyCheck: false,
      connectionName: SUBSCRIBER_CONNECTION_NAME,
      lazyConnect: true
    })

    // Re-subscribe previous channels
    var previousChannels = { subscribe: [], psubscribe: [] }
    if (lastActiveSubscriber) {
      const condition = lastActiveSubscriber.condition || lastActiveSubscriber.prevCondition
      if (condition && condition.subscriber) {
        previousChannels.subscribe = condition.subscriber.channels('subscribe')
        previousChannels.psubscribe = condition.subscriber.channels('psubscribe')
      }
    }
    if (previousChannels.subscribe.length || previousChannels.psubscribe.length) {
      var pending = 0
      for (const type of ['subscribe', 'psubscribe']) {
        var channels = previousChannels[type]
        if (channels.length) {
          pending += 1
          debug('%s %d channels', type, channels.length)
          this.subscriber[type](channels).then(() => {
            if (!--pending) {
              this.lastActiveSubscriber = this.subscriber
            }
          }).catch(noop)
        }
      }
    } else {
      this.lastActiveSubscriber = this.subscriber
    }
    for (const event of ['message', 'messageBuffer']) {
      this.subscriber.on(event, (arg1, arg2) => {
        this.emitter.emit(event, arg1, arg2)
      })
    }
    for (const event of ['pmessage', 'pmessageBuffer']) {
      this.subscriber.on(event, (arg1, arg2, arg3) => {
        this.emitter.emit(event, arg1, arg2, arg3)
      })
    }
  }

  start (): void {
    this.started = true
    this.selectSubscriber()
    debug('started')
  }

  stop (): void {
    this.started = false
    if (this.subscriber) {
      this.subscriber.disconnect()
      this.subscriber = null
    }
    debug('stopped')
  }
}

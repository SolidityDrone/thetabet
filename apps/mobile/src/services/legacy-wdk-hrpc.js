/**
 * HRPC client matching wdk-worklet.mobile.bundle.js (shipped inside wdk-react-native-provider).
 * pear-wrk-wdk beta.8 uses different command IDs — callMethod(3) would hit getAddressBalance(3) on the worklet.
 */
const { c, RPC } = require('hrpc/runtime')

const encodingGetAddressRequest = {
  preencode(state, m) {
    c.string.preencode(state, m.network)
    c.uint.preencode(state, m.accountIndex)
  },
  encode(state, m) {
    c.string.encode(state, m.network)
    c.uint.encode(state, m.accountIndex)
  },
  decode(state) {
    return {
      network: c.string.decode(state),
      accountIndex: c.uint.decode(state),
    }
  },
}

const encodingAddressResponse = {
  preencode(state, m) {
    state.end++
    if (m.address) c.string.preencode(state, m.address)
  },
  encode(state, m) {
    const flags = m.address ? 1 : 0
    c.uint.encode(state, flags)
    if (m.address) c.string.encode(state, m.address)
  },
  decode(state) {
    const flags = c.uint.decode(state)
    return {
      address: (flags & 1) !== 0 ? c.string.decode(state) : null,
    }
  },
}

const encodingWorkletStartRequest = {
  preencode(state, m) {
    state.end++
    if (m.enableDebugLogs) c.uint.preencode(state, m.enableDebugLogs)
    if (m.seedPhrase) c.string.preencode(state, m.seedPhrase)
    if (m.seedBuffer) c.string.preencode(state, m.seedBuffer)
    c.string.preencode(state, m.config)
  },
  encode(state, m) {
    const flags = (m.enableDebugLogs ? 1 : 0) | (m.seedPhrase ? 2 : 0) | (m.seedBuffer ? 4 : 0)
    c.uint.encode(state, flags)
    if (m.enableDebugLogs) c.uint.encode(state, m.enableDebugLogs)
    if (m.seedPhrase) c.string.encode(state, m.seedPhrase)
    if (m.seedBuffer) c.string.encode(state, m.seedBuffer)
    c.string.encode(state, m.config)
  },
  decode(state) {
    const flags = c.uint.decode(state)
    return {
      enableDebugLogs: (flags & 1) !== 0 ? c.uint.decode(state) : 0,
      seedPhrase: (flags & 2) !== 0 ? c.string.decode(state) : null,
      seedBuffer: (flags & 4) !== 0 ? c.string.decode(state) : null,
      config: c.string.decode(state),
    }
  },
}

const encodingWorkletStartResponse = {
  preencode(state, m) {
    state.end++
    if (m.status) c.string.preencode(state, m.status)
  },
  encode(state, m) {
    const flags = m.status ? 1 : 0
    c.uint.encode(state, flags)
    if (m.status) c.string.encode(state, m.status)
  },
  decode(state) {
    const flags = c.uint.decode(state)
    return {
      status: (flags & 1) !== 0 ? c.string.decode(state) : null,
    }
  },
}

/** Matches unpatched worklet encoding8 — native transfers only (to + value). */
const encodingNativeSendOptions = {
  preencode(state, m) {
    c.string.preencode(state, m.to)
    c.string.preencode(state, m.value)
  },
  encode(state, m) {
    c.string.encode(state, m.to)
    c.string.encode(state, m.value)
  },
  decode(state) {
    return {
      to: c.string.decode(state),
      value: c.string.decode(state),
    }
  },
}

const encodingNativeSendOptionsFrame = c.frame(encodingNativeSendOptions)

const encodingSendTransactionRequest = {
  preencode(state, m) {
    c.string.preencode(state, m.network)
    c.uint.preencode(state, m.accountIndex)
    encodingNativeSendOptionsFrame.preencode(state, m.options)
  },
  encode(state, m) {
    c.string.encode(state, m.network)
    c.uint.encode(state, m.accountIndex)
    encodingNativeSendOptionsFrame.encode(state, m.options)
  },
  decode(state) {
    return {
      network: c.string.decode(state),
      accountIndex: c.uint.decode(state),
      options: encodingNativeSendOptionsFrame.decode(state),
    }
  },
}

const encodingTxHashResponse = {
  preencode(state, m) {
    state.end++
    if (m.hash) c.string.preencode(state, m.hash)
    if (m.fee) c.string.preencode(state, m.fee)
  },
  encode(state, m) {
    const flags = (m.hash ? 1 : 0) | (m.fee ? 2 : 0)
    c.uint.encode(state, flags)
    if (m.hash) c.string.encode(state, m.hash)
    if (m.fee) c.string.encode(state, m.fee)
  },
  decode(state) {
    const flags = c.uint.decode(state)
    return {
      hash: (flags & 1) !== 0 ? c.string.decode(state) : null,
      fee: (flags & 2) !== 0 ? c.string.decode(state) : null,
    }
  },
}

const encodingPaymasterToken = {
  preencode(state, m) {
    c.string.preencode(state, m.address)
  },
  encode(state, m) {
    c.string.encode(state, m.address)
  },
  decode(state) {
    return { address: c.string.decode(state) }
  },
}

const encodingPaymasterTokenFrame = c.frame(encodingPaymasterToken)

const encodingAbstractedConfig = {
  preencode(state, m) {
    state.end++
    if (m.paymasterToken) encodingPaymasterTokenFrame.preencode(state, m.paymasterToken)
  },
  encode(state, m) {
    const flags = m.paymasterToken ? 1 : 0
    c.uint.encode(state, flags)
    if (m.paymasterToken) encodingPaymasterTokenFrame.encode(state, m.paymasterToken)
  },
  decode(state) {
    const flags = c.uint.decode(state)
    return {
      paymasterToken: (flags & 1) !== 0 ? encodingPaymasterTokenFrame.decode(state) : null,
    }
  },
}

const encodingAbstractedConfigFrame = c.frame(encodingAbstractedConfig)

/** Contract calls — options is a JSON string with { to, data, value }. */
const encodingAbstractedSendRequest = {
  preencode(state, m) {
    c.string.preencode(state, m.network)
    c.uint.preencode(state, m.accountIndex)
    c.string.preencode(state, m.options)
    state.end++
    if (m.config) encodingAbstractedConfigFrame.preencode(state, m.config)
  },
  encode(state, m) {
    const flags = m.config ? 1 : 0
    c.string.encode(state, m.network)
    c.uint.encode(state, m.accountIndex)
    c.string.encode(state, m.options)
    c.uint.encode(state, flags)
    if (m.config) encodingAbstractedConfigFrame.encode(state, m.config)
  },
  decode(state) {
    const network = c.string.decode(state)
    const accountIndex = c.uint.decode(state)
    const options = c.string.decode(state)
    const flags = c.uint.decode(state)
    return {
      network,
      accountIndex,
      options,
      config: (flags & 1) !== 0 ? encodingAbstractedConfigFrame.decode(state) : null,
    }
  },
}

const METHODS = new Map([
  ['@wdk-core/workletStart', 1],
  [1, '@wdk-core/workletStart'],
  ['@wdk-core/getAddress', 2],
  [2, '@wdk-core/getAddress'],
  ['@wdk-core/sendTransaction', 5],
  [5, '@wdk-core/sendTransaction'],
  ['@wdk-core/getAbstractedAddress', 6],
  [6, '@wdk-core/getAbstractedAddress'],
  ['@wdk-core/abstractedSendTransaction', 11],
  [11, '@wdk-core/abstractedSendTransaction'],
])

class LegacyWdkHrpc {
  constructor(stream) {
    this._stream = stream
    this._requestEncodings = new Map([
      ['@wdk-core/workletStart', encodingWorkletStartRequest],
      ['@wdk-core/getAddress', encodingGetAddressRequest],
      ['@wdk-core/getAbstractedAddress', encodingGetAddressRequest],
      ['@wdk-core/sendTransaction', encodingSendTransactionRequest],
      ['@wdk-core/abstractedSendTransaction', encodingAbstractedSendRequest],
    ])
    this._responseEncodings = new Map([
      ['@wdk-core/workletStart', encodingWorkletStartResponse],
      ['@wdk-core/getAddress', encodingAddressResponse],
      ['@wdk-core/getAbstractedAddress', encodingAddressResponse],
      ['@wdk-core/sendTransaction', encodingTxHashResponse],
      ['@wdk-core/abstractedSendTransaction', encodingTxHashResponse],
    ])
    this._rpc = new RPC(stream, async () => {})
  }

  async _call(name, args) {
    const requestEncoding = this._requestEncodings.get(name)
    const responseEncoding = this._responseEncodings.get(name)
    const request = this._rpc.request(METHODS.get(name))
    request.send(c.encode(requestEncoding, args))
    return c.decode(responseEncoding, await request.reply())
  }

  async workletStart(args) {
    return this._call('@wdk-core/workletStart', args)
  }

  async getAddress(args) {
    return this._call('@wdk-core/getAddress', args)
  }

  async getAbstractedAddress(args) {
    return this._call('@wdk-core/getAbstractedAddress', args)
  }

  async sendTransaction(args) {
    return this._call('@wdk-core/sendTransaction', args)
  }

  async abstractedSendTransaction(args) {
    return this._call('@wdk-core/abstractedSendTransaction', args)
  }

  async callMethod({ methodName, network, accountIndex, args }) {
    if (methodName === 'sendTransaction') {
      const parsed = args ? JSON.parse(args) : []
      const tx = Array.isArray(parsed) ? parsed[0] : parsed
      if (!tx?.to) {
        throw new Error('sendTransaction requires a `to` address')
      }

      const hasCalldata = tx.data && tx.data !== '0x'
      const result = hasCalldata
        ? await this.abstractedSendTransaction({
            network,
            accountIndex,
            options: JSON.stringify({
              to: tx.to,
              data: tx.data,
              value: String(tx.value ?? '0'),
            }),
            config: {
              paymasterToken: {
                address: '0xCf1b86ceD971b88C042C64A9c099377e2738073C',
              },
            },
          })
        : await this.sendTransaction({
            network,
            accountIndex,
            options: {
              to: tx.to,
              value: String(tx.value ?? '0'),
            },
          })

      return { result: JSON.stringify(result) }
    }

    throw new Error(`Legacy WDK worklet does not support callMethod("${methodName}")`)
  }

  async workletStop() {
    return { status: 'stopped' }
  }
}

module.exports = { LegacyWdkHrpc }

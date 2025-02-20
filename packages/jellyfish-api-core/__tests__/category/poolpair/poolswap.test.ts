import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { ContainerAdapterClient } from '../../container_adapter_client'
import BigNumber from 'bignumber.js'
import {
  addPoolLiquidity,
  createPoolPair,
  createToken,
  getNewAddress,
  mintTokens,
  utxosToAccount
} from '@defichain/testing'
import { RpcApiError } from '../../../src'
import { poolpair } from '@defichain/jellyfish-api-core'
import { Testing } from '@defichain/jellyfish-testing'

describe('poolSwap', () => {
  const container = new MasterNodeRegTestContainer()
  const testing = Testing.create(container)
  const client = new ContainerAdapterClient(container)

  beforeAll(async () => {
    await container.start()
    await container.waitForWalletCoinbaseMaturity()
  })

  afterAll(async () => {
    await container.stop()
  })

  it('should poolSwap', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const [addressReceiver, dfiAddress] = await testing.generateAddress(2)
    await testing.token.dfi({ amount: 700, address: dfiAddress })
    await testing.generate(1)

    const metadata: poolpair.PoolSwapMetadata = {
      from: dfiAddress,
      tokenFrom: 'DFI',
      amountFrom: 555,
      to: addressReceiver,
      tokenTo: 'CAT'
    }

    const hex = await client.poolpair.poolSwap(metadata)
    expect(typeof hex).toStrictEqual('string')
    expect(hex.length).toStrictEqual(64)

    await container.generate(1)

    const swapAmount = new BigNumber(1000).minus(new BigNumber(1000 * 500).dividedBy(poolPairBefore.reserveB.plus(555))).multipliedBy(100000000).minus(1).dividedBy(100000000).decimalPlaces(8, BigNumber.ROUND_CEIL) // swap result is floored even before minusing the reserve
    const reserveBAfter = poolPairBefore.reserveB.plus(555)
    const reserveAAfter = new BigNumber(1000).minus(swapAmount)

    const poolPairAfter = await testing.poolpair.get('CAT-DFI')
    expect(new BigNumber(poolPairAfter.reserveB)).toStrictEqual(reserveBAfter)
    expect(poolPairAfter.reserveA.toFixed(8)).toStrictEqual(reserveAAfter.toFixed(8))

    const accountReceiver = (await client.account.getAccount(addressReceiver))[0]
    const accountReceiverBalance = new BigNumber(accountReceiver.split('@')[0]) // 526.06635072
    const amountReceived = new BigNumber(poolPairBefore.reserveA).minus(reserveAAfter) // 526.06635071967734389346

    expect(accountReceiverBalance.toFixed(8)).toStrictEqual(amountReceived.toFixed(8))
  })

  it('should poolSwap with utxos', async () => {
    const tokenAddress = await getNewAddress(container)
    const dfiAddress = await getNewAddress(container)
    const poolLiquidityAddress = await getNewAddress(container)

    await createToken(container, 'ETH', { collateralAddress: tokenAddress })
    await utxosToAccount(container, 1000, { address: dfiAddress })
    await mintTokens(container, 'ETH', { address: dfiAddress })
    await createPoolPair(container, 'ETH', 'DFI')

    await addPoolLiquidity(container, {
      tokenA: 'ETH',
      amountA: 1000,
      tokenB: 'DFI',
      amountB: 500,
      shareAddress: poolLiquidityAddress
    })

    const metadata: poolpair.PoolSwapMetadata = {
      from: dfiAddress,
      tokenFrom: 'DFI',
      amountFrom: 492,
      to: await getNewAddress(container),
      tokenTo: 'ETH',
      maxPrice: 10
    }

    await container.fundAddress(dfiAddress, 25)
    const utxos = await container.call('listunspent')
    const utxo = utxos.find((utxo: { address: string }) => utxo.address === dfiAddress)

    const hex = await client.poolpair.poolSwap(metadata, [utxo])
    expect(typeof hex).toStrictEqual('string')
    expect(hex.length).toStrictEqual(64)

    const rawtx = await container.call('getrawtransaction', [hex, true])
    expect(rawtx.vin[0].txid).toStrictEqual(utxo.txid)
  })

  it('should poolSwap with max price', async () => {
    const tokenAddress = await getNewAddress(container)
    const dfiAddress = await getNewAddress(container)
    const poolLiquidityAddress = await getNewAddress(container)

    await createToken(container, 'HEN', { collateralAddress: tokenAddress })
    await utxosToAccount(container, 1000, { address: dfiAddress })
    await mintTokens(container, 'HEN', { address: dfiAddress })
    await createPoolPair(container, 'HEN', 'DFI')
    await addPoolLiquidity(container, {
      tokenA: 'HEN',
      amountA: 1000,
      tokenB: 'DFI',
      amountB: 500,
      shareAddress: poolLiquidityAddress
    })

    const metadata: poolpair.PoolSwapMetadata = {
      from: dfiAddress,
      tokenFrom: 'DFI',
      amountFrom: 492,
      to: await getNewAddress(container),
      tokenTo: 'HEN',
      maxPrice: 10
    }

    const hex = await client.poolpair.poolSwap(metadata)
    expect(typeof hex).toStrictEqual('string')
    expect(hex.length).toStrictEqual(64)
  })

  it('should not poolSwap with max price and dex fees', async () => {
    await testing.token.create({ symbol: 'SLIP' })
    await testing.generate(1)

    await testing.poolpair.create({
      tokenA: 'SLIP',
      tokenB: 'DFI',
      commission: 0.02
    })
    const address = await testing.address('dfi')
    await testing.token.dfi({ amount: 10001, address })
    await testing.token.mint({ amount: 10000, symbol: 'SLIP' })
    await testing.generate(1)

    await testing.poolpair.add({
      a: { symbol: 'SLIP', amount: 10000 },
      b: { symbol: 'DFI', amount: 10000 }
    })
    await testing.generate(1)
    const poolPairId = Object.keys(await testing.rpc.poolpair.getPoolPair('SLIP-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${poolPairId}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${poolPairId}/token_a_fee_direction`]: 'both',
        [`v0/poolpairs/${poolPairId}/token_b_fee_pct`]: '0.30',
        [`v0/poolpairs/${poolPairId}/token_b_fee_direction`]: 'both'
      }
    })
    await container.generate(1)

    const inputDFIAmount = new BigNumber(1)
    const metadata = {
      from: address,
      tokenFrom: 'DFI',
      amountFrom: inputDFIAmount.toNumber(),
      to: address,
      tokenTo: 'SLIP',
      maxPrice: 1.5
    }

    // manual calculations and verify
    const inputDFIAfterFeeIn = inputDFIAmount.minus(inputDFIAmount.multipliedBy(0.05))
    // (SLIP 1000: DFI 1000)
    const ammSwappedAmountInSLIP = new BigNumber(1000).minus(new BigNumber(1000 * 1000).dividedBy(new BigNumber(inputDFIAfterFeeIn).plus(1000))).multipliedBy(100000000).minus(1).dividedBy(100000000).decimalPlaces(8, BigNumber.ROUND_CEIL)
    const finalAmountAfterFeeOut = ammSwappedAmountInSLIP.minus(ammSwappedAmountInSLIP.multipliedBy(0.3))
    expect(inputDFIAmount.dividedBy(finalAmountAfterFeeOut).gt(1.5)).toBeTruthy()

    await expect(client.poolpair.poolSwap(metadata))
      .rejects.toThrow('Price is higher than indicated.')
    await testing.generate(1)

    const account = await testing.rpc.account.getAccount(address)
    expect(account).toStrictEqual(['1.00000000@DFI'])
  })

  it('should test against max price protection', async () => {
    const tokenAddress = await getNewAddress(container)
    const dfiAddress = await getNewAddress(container)
    const poolLiquidityAddress = await getNewAddress(container)

    await createToken(container, 'BAT', { collateralAddress: tokenAddress })
    await utxosToAccount(container, 500, { address: dfiAddress })
    await mintTokens(container, 'BAT', { address: dfiAddress })
    await createPoolPair(container, 'BAT', 'DFI')
    await addPoolLiquidity(container, {
      tokenA: 'BAT',
      amountA: 500,
      tokenB: 'DFI',
      amountB: 300,
      shareAddress: poolLiquidityAddress
    })

    const metadata: poolpair.PoolSwapMetadata = {
      from: dfiAddress,
      tokenFrom: 'DFI',
      amountFrom: 150,
      to: await getNewAddress(container),
      tokenTo: 'BAT',
      maxPrice: 0.4
    }

    const promise = client.poolpair.poolSwap(metadata)

    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow('Price is higher than indicated')
  })

  it('should not poolswap transaction with pool pair status set as false', async () => {
    const tokenAddress = await getNewAddress(container)
    const dfiAddress = await getNewAddress(container)
    const poolLiquidityAddress = await getNewAddress(container)

    await createToken(container, 'DOG', { collateralAddress: tokenAddress })
    await utxosToAccount(container, 1000, { address: dfiAddress })
    await mintTokens(container, 'DOG', { address: dfiAddress })
    await createPoolPair(container, 'DOG', 'DFI', { status: false })
    await addPoolLiquidity(container, {
      tokenA: 'DOG',
      amountA: 1000,
      tokenB: 'DFI',
      amountB: 500,
      shareAddress: poolLiquidityAddress
    })

    const metadata: poolpair.PoolSwapMetadata = {
      from: dfiAddress,
      amountFrom: 2,
      tokenFrom: 'DFI',
      tokenTo: 'DOG',
      to: await getNewAddress(container)
    }
    await expect(client.poolpair.poolSwap(metadata)).rejects.toThrow('Pool trading is turned off!')
  })

  it('should not poolSwap with invalid token', async () => {
    const address = await getNewAddress(container)
    const metadata: poolpair.PoolSwapMetadata = {
      from: address,
      amountFrom: 2,
      tokenFrom: 'INVALIDTOKEN',
      tokenTo: 'FOX',
      to: address
    }
    await expect(client.poolpair.poolSwap(metadata)).rejects.toThrow('TokenFrom was not found')
  })

  it('should not swap tokens when input value is 0', async () => {
    const [addressReceiver, dfiAddress] = await testing.generateAddress(2)
    await testing.token.dfi({ amount: 700, address: dfiAddress })
    await testing.generate(1)
    const metadata: poolpair.PoolSwapMetadata = {
      from: dfiAddress,
      tokenFrom: 'DFI',
      amountFrom: 0,
      to: addressReceiver,
      tokenTo: 'CAT'
    }

    const promise = client.poolpair.poolSwap(metadata)
    await expect(promise).rejects.toThrow('RpcApiError: \'Test PoolSwapTx execution failed:\nInput amount should be positive\', code: -32600, method: poolswap')
  })
})

describe('poolSwap asymmetric pool swap fee', () => {
  const container = new MasterNodeRegTestContainer()
  const testing = Testing.create(container)
  const client = new ContainerAdapterClient(container)
  const swapAmount = 555

  beforeEach(async () => {
    await container.start()
    await container.waitForWalletCoinbaseMaturity()
  })

  afterEach(async () => {
    await container.stop()
  })

  async function poolSwap (tokenFrom: string, tokenTo: string): Promise<string> {
    const [receiverAddress, senderAddress] = await testing.generateAddress(2)
    if (tokenFrom === 'DFI') {
      await testing.token.dfi({ amount: swapAmount, address: senderAddress })
    } else {
      await testing.token.mint({ amount: swapAmount, symbol: 'CAT' })
      await testing.generate(1)
      await testing.token.send({ address: senderAddress, amount: swapAmount, symbol: 'CAT' })
    }
    await testing.generate(1)

    const metadata: poolpair.PoolSwapMetadata = {
      from: senderAddress,
      tokenFrom: tokenFrom,
      amountFrom: swapAmount,
      to: receiverAddress,
      tokenTo: tokenTo
    }

    const hex = await client.poolpair.poolSwap(metadata)
    expect(typeof hex).toStrictEqual('string')
    expect(hex.length).toStrictEqual(64)

    await container.generate(1)

    return receiverAddress
  }

  async function checkDFItoCAT (poolPairBefore: poolpair.PoolPairInfo, receiverAddress: string, feeInPct: BigNumber, feeOutPct: BigNumber): Promise<void> {
    // Calculate dex in fee
    const dexInFee = feeInPct.multipliedBy(swapAmount)
    const amountIn = new BigNumber(swapAmount).minus(dexInFee)

    // Check results
    const poolPairAfter = await testing.poolpair.get('CAT-DFI')
    expect(poolPairAfter.reserveB.minus(poolPairBefore.reserveB)).toStrictEqual(amountIn)

    const catId = Object.keys(await client.token.getToken('CAT'))[0]
    const swappedAmount = (await client.account.getAccount(receiverAddress, {}, { indexedAmounts: true }))[catId]
    const reserveDiff = poolPairBefore.reserveA.minus(poolPairAfter.reserveA)

    // Check swapped amount
    const dexOutFee = feeOutPct.multipliedBy(reserveDiff).decimalPlaces(8, BigNumber.ROUND_FLOOR)
    expect(new BigNumber(reserveDiff).minus(dexOutFee)).toStrictEqual(new BigNumber(swappedAmount))
  }

  async function checkCATtoDFI (poolPairBefore: poolpair.PoolPairInfo, receiverAddress: string, feeInPct: BigNumber, feeOutPct: BigNumber): Promise<void> {
    // Calculate dex in fee
    const dexInFee = feeInPct.multipliedBy(swapAmount)
    const amountIn = new BigNumber(swapAmount).minus(dexInFee)

    // Check results
    const poolPairAfter = await testing.poolpair.get('CAT-DFI')
    expect(poolPairAfter.reserveA.minus(poolPairBefore.reserveA)).toStrictEqual(amountIn)

    const dfiId = Object.keys(await client.token.getToken('DFI'))[0]
    const swappedAmount = (await client.account.getAccount(receiverAddress, {}, { indexedAmounts: true }))[dfiId]
    const reserveDiff = poolPairBefore.reserveB.minus(poolPairAfter.reserveB)

    // Check swapped amount
    const dexOutFee = feeOutPct.multipliedBy(reserveDiff).decimalPlaces(8, BigNumber.ROUND_FLOOR)
    expect(new BigNumber(reserveDiff).minus(dexOutFee)).toStrictEqual(new BigNumber(swappedAmount))
  }

  it('should poolSwap DFI to CAT - TokenA fee direction is in', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'in'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - TokenA fee direction is in', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'in'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0.05)
    const feeOutPct = new BigNumber(0)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap DFI to CAT - TokenA fee direction is out', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'out'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0.05)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - TokenA fee direction is out', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'out'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap DFI to CAT - TokenB fee direction is in', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'both',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'in'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0.05)
    const feeOutPct = new BigNumber(0)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - TokenB fee direction is in', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'both',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'in'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap DFI to CAT - TokenB fee direction is out', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'out'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - TokenB fee direction is out', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'out'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0.05)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap DFI to CAT - Both token fee directions are in', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'in',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'in'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0.05)
    const feeOutPct = new BigNumber(0)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - Both token fee directions are in', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'in',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'in'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0.05)
    const feeOutPct = new BigNumber(0)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap DFI to CAT - Both token fee directions are out', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'out',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'out'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0.05)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - Both token fee directions are out', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'out',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'out'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0)
    const feeOutPct = new BigNumber(0.05)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap DFI to CAT - Both token fee directions are both', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'both',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'both'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('DFI', 'CAT') // swap from DFI to CAT

    const feeInPct = new BigNumber(0.05)
    const feeOutPct = new BigNumber(0.05)

    await checkDFItoCAT(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })

  it('should poolSwap CAT to DFI - Both token fee directions are both', async () => {
    const poolPairBefore = await testing.fixture.createPoolPair({
      a: { amount: 1000, symbol: 'CAT' },
      b: { amount: 500, symbol: 'DFI' }
    })

    const ppTokenID = Object.keys(await client.token.getToken('CAT-DFI'))[0]

    await client.masternode.setGov({
      ATTRIBUTES: {
        [`v0/poolpairs/${ppTokenID}/token_a_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_a_fee_direction`]: 'both',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_pct`]: '0.05',
        [`v0/poolpairs/${ppTokenID}/token_b_fee_direction`]: 'both'
      }
    })
    await container.generate(1)

    const receiverAddress = await poolSwap('CAT', 'DFI') // swap from CAT to DFI

    const feeInPct = new BigNumber(0.05)
    const feeOutPct = new BigNumber(0.05)

    await checkCATtoDFI(poolPairBefore, receiverAddress, feeInPct, feeOutPct)
  })
})

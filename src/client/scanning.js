const { BigNumber } = require("bignumber.js")
const eac = require("../index")

const store = (conf, txRequest) => {
	const log = conf.logger

	if (conf.cache.has(txRequest.address)) {
		log.cache(`Cache already contains ${txRequest.address}`)
		return
	}
	log.info(`Storing found txRequest at address ${txRequest.address}`)
	conf.cache.set(txRequest.address, txRequest.windowStart)
}

const scanBlockchain = async conf => {
	const log = conf.logger
	const web3 = conf.web3

	const leftBlock = (await eac.Util.getBlockNumber(web3)) - conf.scanSpread
	const rightBlock = leftBlock + conf.scanSpread * 2

	const leftTimestamp = await eac.Util.getTimestampForBlock(web3, leftBlock)
	const avgBlockTime = Math.floor(await eac.Util.getTimestamp(web3) - leftTimestamp / conf.scanSpread)
	const rightTimestamp = Math.floor(leftTimestamp + avgBlockTime * conf.scanSpread * 2)

	log.debug(`Scanning bounds from 
[debug] blocks: ${leftBlock} to ${rightBlock}
[debug] timestamps: ${leftTimestamp} tp ${rightTimestamp}`)

	scan(conf, leftBlock, rightBlock)
	scan(conf, leftTimestamp, rightTimestamp)
}
 
const scan = async (conf, left, right) => {
	const log = conf.logger
	const web3 = conf.web3

	const requestTracker = conf.tracker
	const requestFactory = conf.factory

	requestTracker.setFactory(requestFactory.address)

	let nextRequestAddress = await requestTracker.nextFromLeft(left)

	if (nextRequestAddress === eac.Constants.NULL_ADDRESS) {
		log.info("No new requests.")
		return
	} else if (!eac.Util.checkValidAddress(nextRequestAddress)) {
		throw new Error(
			`Received invalid response from Request Tracker | Response: ${nextRequestAddress}`
		)
	}

	while (nextRequestAddress !== eac.Constants.NULL_ADDRESS) {
		log.debug(`Found request - ${nextRequestAddress}`)

		// Verify that the request is known to the factory we are validating with.
		if (!await requestFactory.isKnownRequest(nextRequestAddress)) {
			log.error(
				`Encountered unknown transaction request: ${
					requestFactory.address
				} | query: ">=" | value ${left} | address: ${nextRequestAddress}`
			)
			throw new Error(
				`Encountered unknown address! Please check that you are using the correct contracts JSON file.`
			)
		}

		const trackerWindowStart = await requestTracker.windowStartFor(
			nextRequestAddress
		)

		const txRequest = new eac.TxRequest(nextRequestAddress, web3)
		await txRequest.fillData()

		if (!txRequest.windowStart.equals(trackerWindowStart)) {
			// The data between the txRequest we have and from the requestTracker do not match.
			log.error(
				`Data mismatch between txRequest and requestTracker. Double check contract addresses.`
			)
		} else if (txRequest.windowStart.lessThanOrEqualTo(right)) {
			// This request is within bounds, store it.
			store(conf, txRequest)
		} else {
			console.log
			log.debug(
				`Scan exit condition hit! Next window start exceeds right bound. WindowStart: ${txRequest.windowStart} | right: ${right}`
			)
			break
		}
		nextRequestAddress = await requestTracker.nextRequest(txRequest.address)

		// Hearbeat
		if (nextRequestAddress === eac.Constants.NULL_ADDRESS) {
			log.info("No new requests.")
		}
	}
}

const { routeTxRequest } = require("./routing.js")

const scanCache = async conf => {
	if (conf.cache.len() === 0) return //nothing stored in cache

	const allTxRequests = conf.cache
		.stored()
		.map(address => new eac.TxRequest(address, conf.web3))

	allTxRequests.forEach(txRequest => {
		txRequest.refreshData().then(_ => routeTxRequest(conf, txRequest))
	})
}

module.exports = {
	scanBlockchain,
	scanCache,
}

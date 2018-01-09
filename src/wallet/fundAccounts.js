const { LightWallet } = require('../client/lightWallet.js')

// TODO before mainnet - change the default gas / gasPrice
// to dynamically calculated values
const fund = (web3, recip, value) => {
    return web3.eth.sendTransaction({
        from: web3.eth.defaultAccount,
        to: recip,
        value: value,
        gas: 3000000,
        gasPrice: web3.utils.toWei('100', 'gwei')
    })
    .on('error', console.error)
}

const fundAccounts = (web3, etherAmount, file, password) => {
    const wallet = new LightWallet(web3)
    wallet.decryptAndLoad(file, password)

    const amt = web3.utils.toWei(etherAmount, 'ether')

    
    return Promise.all(wallet.getAccounts().map(account => {
        return fund(web3, account, amt)
    }))
}

module.exports = fundAccounts
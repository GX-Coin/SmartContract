'use strict';

var _ = require('underscore');

module.exports = {

    /**
     * This is a helper method to process EVM when it contains references to external libraries
     * @param byteCode
     * @param {{name: string, address: string}[]} libraries
     * @returns {string}
     * @private
     */
    injectLibrariesIntoBytecode(byteCode, libraries) {
        var evmCode = byteCode;

        _.each(libraries, library => {
            let paddedName = (library.name + '____________________________________').substr(0, 36);
            var regex = new RegExp('__' + paddedName + '__', 'g');

            evmCode = evmCode.replace(regex, library.address.substr(2));
        });

        return evmCode;
    },

    /**
     *
     * @param web3
     * @param {string} data
     * @param options
     * @returns {Promise}
     */
    deployContract(web3, data, options) {
        var gasPrice = options.gasPrice;
        var from = options.from;
        var nonce = options.nonce;

        if (!_.isUndefined(nonce)) {
            this.log('Using nonce ' + nonce);
        }

        return new Promise((resolve, reject) => {
            web3.eth.estimateGas({data}, (error, gas) => {
                if (error) {
                    return reject(error);
                }

                this.log('estimated ' + gas + ' gas');

                web3.eth.sendTransaction({
                    from,
                    data,
                    gas,
                    gasPrice,
                    nonce
                }, (error, transactionHash) => {
                    if (error) {
                        return reject(error);
                    }

                    // this is needed for testrpc to correctly keep track of the nonce
                    // testrpc queues the transactions and calling getTransaction insta-mines it
                    // this forces the nonce to increment correctly
                    web3.eth.getTransaction(transactionHash, (error, result) => {
                        if (error) {
                            return reject(error);
                        }
                        console.log('deployed contract with tx hash ' + transactionHash + ' and nonce ' + result.nonce);
                        resolve(transactionHash);
                    });
                });
            });
        });
    },

    /**
     * Deploys a contract using the contract constructor
     * @param web3
     * @param {string} data
     * @param {Object} abi
     * @param {Array<*>} constructorArguments
     * @param options
     * @returns {Promise}
     */
    deployContractWithConstructor(web3, data, abi, constructorArguments, options) {
        var contractDefinition = web3.eth.contract(abi);

        if (_.isArray(constructorArguments) && !_.isEmpty(constructorArguments)) {
            // encode constructor arguments and add it to the data
            // after this method, data will contain both the bytecode AND constructor parameters
            // so we can just use regular ole' `deployContract` method
            data = contractDefinition.getData(constructorArguments, {data});
        }

        return this.deployContract(web3, data, options);
    },

    log(/*arguments*/) {
        console.log.apply(this, arguments);
    }
};
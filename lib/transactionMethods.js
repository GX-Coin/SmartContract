'use strict';

const _ = require('underscore');
const async = require('async');

module.exports = {
    /**
     *
     * @param {{eth: {getTransactionReceipt: function, getBlockNumber: function}}} web3
     * @param transactionHash
     * @param blocksToConfirm
     * @param [interval]
     * @returns {Promise}
     */
    confirmTransaction(web3, transactionHash, blocksToConfirm, interval) {
        if (!interval) {
            interval = 5000;
        }

        var blocksConfirmed = -1;
        return new Promise((resolve, reject) => {
            async.doUntil(
                callback => {
                    if (transactionHash == null) {
                        callback('transactionHash must have a value', null);
                        return;
                    }

                    web3.eth.getTransactionReceipt(transactionHash, (err, receipt) => {
                        if (receipt == null) {
                            this.log(transactionHash + ' transaction waiting to be mined ...');
                            return setTimeout(function() {
                                callback(null, null);
                            }, interval);
                        }

                        web3.eth.getBlockNumber((err, blockNumber) => {
                            if (err) {
                                callback(err, null);
                                return;
                            }
                            blocksConfirmed = blockNumber - receipt.blockNumber;

                            if (blocksConfirmed >= blocksToConfirm) {
                                this.log(transactionHash + ' transaction block: ' + blocksConfirmed.toString() +
                                    '; confirmed, used ' + receipt.gasUsed + ' gas');

                                callback(null, receipt);
                            } else {
                                this.log(transactionHash + ' transaction block: ' + blocksConfirmed.toString() +
                                    '; will confirm in ' + (blocksToConfirm - blocksConfirmed) + ' blocks ...');

                                setTimeout(function() {
                                    callback();
                                }, interval);
                            }
                        });

                    });
                },
                // stop the loop when contracts has an address
                () => blocksConfirmed >= blocksToConfirm,
                (error, receipt) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(receipt);
                    }
                }
            );
        });
    },

    /**
     * Confirm multiple transactions
     * @param web3
     * @param transactionHashes
     * @param blocksToConfirm
     * @param [interval]
     * @returns {Promise}
     */
    confirmTransactions(web3, transactionHashes, blocksToConfirm, interval) {
        return Promise.all(_.map(_.filter(transactionHashes, hash => !!hash), hash =>
            this.confirmTransaction(web3, hash, blocksToConfirm, interval)));
    },

    /**
     *
     * @param {Array} logs
     * @param event
     * @returns {Promise}
     */
    decodeEventLogs(logs, event) {
        /**
         * to understand this code, you need to read how the contract events are build inside `web3.eth.contract` method
         * for each event in the ABI, a SolidityEvent class is constructed and then `attachToContract` method is called
         *
         * SolidityEvent.prototype.attachToContract = function (contract) {
         *     var execute = this.execute.bind(this);
         *     var displayName = this.displayName();
         *     if (!contract[displayName]) {
         *         contract[displayName] = execute;
         *     }
         *     contract[displayName][this.typeName()] = this.execute.bind(this, contract);
         * };
         *
         *
         * So, the `contract.event` object is actually the SolidityEvent.execute method
         * that means we cannot directly access the SolidityEvent object, which is a shame
         * Now, lets look inside the `execute` method:
         *
         * SolidityEvent.prototype.execute = function (indexed, options, callback) {
         *
         *     if (utils.isFunction(arguments[arguments.length - 1])) {
         *         callback = arguments[arguments.length - 1];
         *         if(arguments.length === 2)
         *             options = null;
         *         if(arguments.length === 1) {
         *             options = null;
         *             indexed = {};
         *         }
         *     }
         *
         *     var o = this.encode(indexed, options);
         *     var formatter = this.decode.bind(this);
         *     return new Filter(this._requestManager, o, watches.eth(), formatter, callback);
         * };
         *
         *
         * The important parts are the `this.encode` and `this.decode` functions are passed down to the filter object
         * I will not go further into the details, but the `encode` function uses `SolidityEvent.signature()` method
         * as the first topic
         * And the `decode` function is assigned to the formatter
         *
         * So, in short
         *  - When we call `contract.method()` we actually get the Filter object
         *  - The filter object has the event signature as the first topic in the options (e.g. filter.options.topics[0])
         *  - The decode function is bound the filter formatter property (e.g. filter.formatter)
         *
         *  Knowing this, the code below _should_ make sense
         */

        let filter = event();
        let signature = filter.options.topics[0];
        let decode = filter.formatter;

        // the logs collection may contain other events. filter out only the ones we need by signature
        let eventLogs = _.filter(logs, log => !_.isEmpty(log.topics) && log.topics[0] === signature);

        // now we can decode the event logs that we _know_ were created by this event
        let decodedEventLogs = _.map(eventLogs, log => decode(log));

        return Promise.resolve(decodedEventLogs);
    },

    log(/*arguments*/) {
        console.log.apply(this, arguments);
    }
};
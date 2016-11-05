/**
 * Methods that are common to most contract unit tests
 * Created by leonid.gaiazov on 7/14/2016.
 */
'use strict';

var chai = require('chai');
chai.use(require('chai-string'));

var assert = chai.assert;

var TestMethods = {

    /**
     * Gets the deployed contracts address from the transaction hash of the deployment transaction
     * @param web3
     * @param transactionHash
     * @returns {Promise}
     */
    getContractAddressFromTransaction(web3, transactionHash) {
        return new Promise((resolve, reject) => {
            web3.eth.getTransactionReceipt(transactionHash, function(err, receipt) {
                if (err) {
                    return reject(err);
                }

                try {
                    assert.isNotNull(receipt, 'receipt must have a value');
                    assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                    assert.notEqual(receipt.contractAddress, null, 'Transaction did not create a contract');
                } catch (e) {
                    return reject(e);
                }
                return resolve(receipt.contractAddress);
            });
        });
    },

    logger: {
        log: function(message) {
            console.log(message);
        },
        debug: function(message) {
            // uncomment for more debug messages
            //console.log(message);
        }
    },

    revertToSnapshot(web3, snapshotId) {
        if (!snapshotId) {
            return Promise.resolve(true);
        }
        return new Promise((resolve, reject) => {
            web3.currentProvider.sendAsync({ method: 'evm_revert', params: [snapshotId] }, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }

                let isSuccessful = result.result;
                this.logger.debug('reverted to snapshot #' + snapshotId + ' -> ' + isSuccessful);
                resolve(isSuccessful);
            });
        });
    },

    getSnapshotId(web3) {
        return new Promise((resolve, reject) => {
            web3.currentProvider.sendAsync({ method: 'evm_snapshot' }, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                let snapshotId = result.result;
                this.logger.debug('current snapshot #' + snapshotId);
                resolve(snapshotId);
            });
        });
    }
};

module.exports = TestMethods;
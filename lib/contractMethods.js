'use strict';

const _ = require('underscore');
const promisify = require('es6-promisify');
const transactionMethods = require('./transactionMethods');
const deploymentMethods = require('./deploymentMethods');

module.exports = {
    /**
     * A helper function to check if code actually exists at the contract address
     * @param {{eth: {getCode: function}}} web3
     * @param {{name: string, address: string}} contract
     * @returns {Promise}
     */
    checkCodeExists(web3, contract) {
        this.log('Checking deployed code for ' + contract.name + ' contract...');
        return promisify(web3.eth.getCode)(contract.address).then(contractCode => {
            if (contractCode == null || contractCode == '0x' || contractCode == '0x0') {
                throw new Error('Contract ' + contract.name + ' doesn\'t have any code at ' + contract.address);
            }
        });
    },

    /**
     * @param {{eth: object}} web3
     * @param {{transaction: string, name: string, definition: object, gasUsed: number, [promised], [block], [contract]}} contract
     * @param [blocks]
     * @param [interval]
     * @returns {*}
     */
    confirmContractTransaction(web3, contract, blocks, interval) {
        let transactionHash = contract.transaction;
        if (transactionHash == null) {
            return Promise.reject('contract ' + contract.name + ' does not have a transaction hash');
        }

        return transactionMethods.confirmTransaction(web3, transactionHash, blocks, interval)
            .then(receipt => {
                contract.address = receipt.contractAddress;
                contract.block = receipt.blockNumber;
                contract.contract = contract.definition.at(contract.address);
                contract.gasUsed = receipt.gasUsed;

                this.promisifyContract(contract);

                this.log(contract.name + ' address: ' + contract.address + ' (' + contract.gasUsed + ' gas used)');

                return contract.address;
            });
    },

    /**
     *
     * @param {{name: string, promised: object, contract: object}} contract
     */
    promisifyContract(contract) {
        // promisify all contract functions
        let promiseContract = {};
        _.each(_.functions(contract.contract), functionName => {
            promiseContract[functionName] = promisify(contract.contract[functionName]);
        });
        contract.promised = promiseContract;
    },

    /**
     * Deploys a library contract and returns a promise that resolves to the deployed contract address
     * @returns {Promise}
     * @param web3
     * @param contract
     * @param options
     */
    deployLibrary(web3, contract, options) {
        var libraries = options.libraries;
        var blocks = options.blocks;
        var gasPrice = options.gasPrice;
        var interval = options.interval;
        var nonce = options.nonce;

        var bytecode = deploymentMethods.injectLibrariesIntoBytecode(contract.bytecode, libraries);
        return deploymentMethods.deployContract(web3, bytecode, {gasPrice, nonce})
            .then(tx => {
                contract.transaction = tx;
                return this.confirmContractTransaction(web3, contract, blocks, interval);
            })
            .then(() => this.checkCodeExists(web3, contract))
            .then(() => contract);
    },

    /**
     * Deploys a contract via constructor and returns the ready to use contract JS object
     * @param web3
     * @param {{bytecode: string, abi: object, name: string, transaction: string, definition: object, address: string}} contract
     * @param {Array<*>} constructorArguments
     * @param options
     * @returns {Promise}
     */
    deployContract(web3, contract, constructorArguments, options) {
        var libraries = options.libraries;
        var gasPrice = options.gasPrice;
        var nonce = options.nonce;

        this.log('Deploying contract ' + contract.name);
        var bytecode = deploymentMethods.injectLibrariesIntoBytecode(contract.bytecode, libraries);

        return deploymentMethods.deployContractWithConstructor(web3, bytecode, contract.abi, constructorArguments, { gasPrice, nonce })
            .then(tx => {
                contract.transaction = tx;
                return contract;
            });
    },

    /**
     *
     * @param web3
     * @param contract
     * @param options
     * @returns {Promise}
     */
    confirmContract(web3, contract, options) {
        var blocks = options.blocks;
        var interval = options.interval;

        return this.confirmContractTransaction(web3, contract, blocks, interval)
            .then(() => this.checkCodeExists(web3, contract))
            .then(() => contract);
    },

    useExistingContract(web3, contract, existingContract) {
        this.log('Using existing contract ' + contract.name + ' at ' + existingContract.address);

        contract.address = existingContract.address;

        if (existingContract.abi) {
            this.log('Using existing ABI for contract ' + contract.name);

            contract.abi = existingContract.abi;
            contract.definition = web3.eth.contract(contract.abi);
        }

        contract.contract = contract.definition.at(contract.address);
        this.promisifyContract(contract);

        return this.checkCodeExists(web3, contract)
            .then(() => contract);
    },

    log(/*arguments*/) {
        console.log.apply(this, arguments);
    }
};
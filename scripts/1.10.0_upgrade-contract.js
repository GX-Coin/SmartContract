// jscs:disable maximumLineLength
'use strict';

const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const _ = require('underscore');
const parseArgs = require('minimist');
const promisify = require('es6-promisify');

const isWin = /^win/.test(process.platform);

let defaultArgs = {
    gas: 250000,
    ipc: isWin
        ? '\\\\.\\pipe\\geth.ipc'
        : '/tmp/greatCoin/data/geth.ipc',
    optimize: true,
    blocks: 0,
    contracts: '1.10.0_test-contracts'
};

let args = _.defaults(parseArgs(process.argv.slice(2), {
    // this option is to force minimist to decode 0x__ addresses as strings instead of numbers
    string: [
        'account',
        'deploymentAdmins'
    ]
}), defaultArgs);

const migrate = require('./migrate-methods');
const contractMethods = require('./../lib/contractMethods');
const solcWrapper = require('./../lib/solcWrapper');
const transactionMethods = require('./../lib/transactionMethods');

console.log('Using IPC path ' + args.ipc);
var web3 = new Web3(new Web3.providers.IpcProvider(args.ipc, require('net')));

// old contracts that we need for linking purposes
// in future, these should be imported from external javascript files

let contracts = {};

const oldContracts = require('./' + args.contracts);

_.each(oldContracts, (contract, contractName) => {
    let contractObject = migrate.buildContractFromAbi(web3, contractName, contract.abi, contract.address);
    if (contractObject.contract) {
        contractMethods.promisifyContract(contractObject);
    }
    contracts[contractName] = contractObject;
});

// 0. libraries
const libraries = [
    {
        name: 'IterableAddressMapping',
        address: contracts.IterableAddressMapping.address
    },
    {
        name: 'IterableAddressBalanceMapping',
        address: contracts.IterableAddressBalanceMapping.address
    }
];

let oldDeploymentAdmins = [];

Promise.resolve()
    .then(() => getPrimaryAddress(web3, args.account))
    .then(account => {
        console.log('Using account ' + account);
        web3.eth.defaultAccount = account;
    })

    /**
     * Check if deployment admin on old deployment admins contract.
     * This is needed so we can link the old GxAdmins, GxTraders, GxBuyOrders and GxSellOrders to new deployment admins
     */
    .then(() => contracts.OldGxDeploymentAdmins.promised.contains(args.account))
    .then(isDeploymentAdmin => {
        if (!isDeploymentAdmin) {
            throw new Error('not a deployment admin on old deployment admins contract');
        }
    })

    /**
     * Export old deployment admins
     */
    .then(() => console.log('exporting old deployment admins'))
    .then(() => migrate.getAccounts(contracts.OldGxDeploymentAdmins.contract, address => address))
    .then(deploymentAdmins => oldDeploymentAdmins = deploymentAdmins)
    .then(() => console.log('old deployment admins: ' + JSON.stringify(oldDeploymentAdmins, null, '  ')))

    /**
     * Deploy new deployment admins contract
     */
    .then(() => console.log('deploying new deployment admins contract'))
    .then(() => deployContract('GxDeploymentAdmins', []))
    .then(contract => contracts.GxDeploymentAdmins = contract)

    /**
     * import old deployment admins into new contract
     */
    .then(() => console.log('importing old deployment admins into new contract'))
    .then(() => {
        // promisify the 'add' function on the new deployment admins contract
        let addFunction = promisify(contracts.GxDeploymentAdmins.contract.add);

        // map each old deployment admin to a promise to add this deployment admin to the new contract
        let addPromises = _.map(oldDeploymentAdmins, deploymentAdmin => addFunction(deploymentAdmin));

        return Promise.all(addPromises);
    })
    // confirm transactions for adding new deployment admins
    .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, args.blocks))

    .then(() => migrate.getAccounts(contracts.GxDeploymentAdmins.contract, address => address))
    .then(newDeploymentAdmins => console.log('new deployment admins: ' + JSON.stringify(newDeploymentAdmins, null, '  ')))

    /**
     * Deploy new GxCoin and GxEvents, using new deployment admins contract
     */
    .then(() => console.log('deploying new GxCoin and GxEvents'))
    .then(() => Promise.all([
        deployContract('GxCoin', [contracts.GxDeploymentAdmins.address]),
        deployContract('GxEvents', [contracts.GxDeploymentAdmins.address])
    ]))
    .then(deployedContracts => {
        contracts.GxCoin = deployedContracts[0];
        contracts.GxEvents = deployedContracts[1];
    })

    /**
     * Deploy new GxOrders, linked to new GxCoin and GxEvents
     * Link GxOrders to old GxBuyOrders, GxSellOrders and GxConstants
     * Link GxCoin to new GxOrders and old GxTraders and GxAdmins
     * Allow GxOrders to make changes to sell and buy order lists
     */
    .then(() => console.log('deploying and linking new GxOrders'))
    .then(() => deployContract('GxOrders', [contracts.GxCoin.address, contracts.GxEvents.address], 3500000))
    .then(contract => contracts.GxOrders = contract)

    .then(() => Promise.all([
        contracts.GxOrders.promised.addDataContracts(contracts.GxBuyOrders.address, contracts.GxSellOrders.address, { gas: args.gas }),
        contracts.GxOrders.promised.upgradeConstantsContract(contracts.GxConstants.address, { gas: args.gas }),
        contracts.GxSellOrders.promised.addOwner(contracts.GxOrders.address, { gas: args.gas }),
        contracts.GxBuyOrders.promised.addOwner(contracts.GxOrders.address, { gas: args.gas }),
        contracts.GxCoin.promised.setContracts(contracts.GxAdmins.address, contracts.GxTraders.address, contracts.GxOrders.address, { gas: args.gas })
    ]))
    .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, args.blocks))

    /**
     * Allow GxCoin and GxOrders to raise events on new GxEvents
     */
    .then(() => console.log('linking new GxEvents'))
    .then(() => Promise.all([
        contracts.GxEvents.promised.addOwner(contracts.GxOrders.address, { gas: args.gas }),
        contracts.GxEvents.promised.addOwner(contracts.GxCoin.address, { gas: args.gas }),
        contracts.GxCoin.promised.upgradeEventsContract(contracts.GxEvents.address)
    ]))
    .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, args.blocks))

    /**
     * Upgrade old contracts to use new deployment admins contracts
     */
    .then(() => console.log('Upgrading deploymentAdmins on old contracts'))
    .then(() => Promise.all([
        contracts.GxAdmins.promised.upgradeGreatCoin(contracts.GxCoin.address),
        contracts.GxTraders.promised.upgradeGreatCoin(contracts.GxCoin.address),
        contracts.GxBuyOrders.promised.upgradeDeploymentAdmins(contracts.GxDeploymentAdmins.address),
        contracts.GxSellOrders.promised.upgradeDeploymentAdmins(contracts.GxDeploymentAdmins.address)
    ]))
    .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, args.blocks))

    /**
     * Write some javascript output
     */
    .then(() => {
        let definitions = {
            greatCoin: contracts.GxCoin,
            gxDeploymentAdmins: contracts.GxDeploymentAdmins,
            gxAdmins: contracts.GxAdmins,
            gxTraders: contracts.GxTraders,
            gxBuyOrders: contracts.GxBuyOrders,
            gxSellOrders: contracts.GxSellOrders,
            gxOrders: contracts.GxOrders,
            gxConstants: contracts.GxConstants,
            gxEvents: contracts.GxEvents
        };

        console.log('Generating javascript files ... ');
        generateDefinitionsJs(definitions, 'greatCoin.definitions.js');
        generateAddressesJs(definitions, 'greatCoin.js');
    })

    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.log(err.stack ? err.stack : err);
        process.exit(-1);
    });

/**
 * Method used to fetch primaryAddress
 *
 * @param web3
 * @param primaryAddress
 * @returns {Promise}
 */
var getPrimaryAddress = function(web3, primaryAddress) {
    return new Promise((resolve, reject) => {
        if (_.isUndefined(primaryAddress)) {
            web3.eth.getCoinbase((err, coinbase) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(coinbase);
                }
            });
        } else {
            resolve(primaryAddress);
        }
    });
};

/**
 *
 * @param args
 * @param argumentName
 */
var checkArgument = function(args, argumentName) {
    if (!_.has(args, argumentName)) {
        console.error('--' + argumentName + ' parameter must be specified');
        process.exit(-1);
    }
};

var deployContract = function(contractName, params, gas) {
    let solcOutput = solcWrapper.compile(contractName + '.sol', args.optimize, path.join(__dirname, '..'));

    if (solcOutput.errors) {
        console.log('Compilation errors! See below:');
        _.each(solcOutput.errors, error => {
            console.log(error);
        });
        return Promise.reject('Compilation errors');
    }

    let contract = solcWrapper.buildContractFromSolcOutput(web3, solcOutput, contractName);

    return contractMethods.deployContract(web3, contract, params, libraries, args.blocks, gas);
};

/**
 * This function only outputs updated abi, used when the contracts are compiled but not deployed
 * @param definitions
 * @param fileName
 */
function generateDefinitionsJs(definitions, fileName) {
    console.log('Generating ' + fileName + ' ...');
    var js = '';

    _.each(definitions, (contract, name) => {
        js = js.concat(name + 'Abi = ' + contract.interface + ';\r\n');
        js = js.concat(name + 'Contract = web3.eth.contract(' + name + 'Abi);\r\n');
        // Intentionally not filling in the library links.  Will need to replace if re-deploying
        js = js.concat(name + 'Code = \'0x' + contract.bytecode + '\';\r\n');
    });

    fs.writeFileSync(fileName, js);
}

/**
 * If the scripts were deployed, then this function will output the contracts and the addresses they were deployed at
 * @param definitions
 * @param fileName
 */
function generateAddressesJs(definitions, fileName) {
    console.log('Generating ' + fileName + ' ...');

    var js = '';

    // Libraries have an address, but can't be individually instantiated
    js = js.concat('iterableAddressMappingAddress = \'' + contracts.IterableAddressMapping.address + '\';\r\n');
    js = js.concat('iterableAddressBalanceMappingAddress = \'' + contracts.IterableAddressBalanceMapping.address + '\';\r\n');

    _.each(definitions, (contract, name) => {
        js = js.concat(name + 'Address = \'' + contract.address + '\';\r\n');
        js = js.concat(name + ' = ' + name + 'Contract.at(' + name + 'Address);\r\n');
    });

    js = js.concat('greatCoin.transactionHash = \'' + contracts.GxCoin.transaction + '\';\r\n');
    js = js.concat('greatCoin.blockNumber = ' + contracts.GxCoin.block + ';\r\n');

    fs.writeFileSync(fileName, js);
}
// jscs:disable maximumLineLength
'use strict';

var Web3 = require('web3');
var _ = require('underscore');
var promisify = require('es6-promisify');
var parseArgs = require('minimist');

var isWin = /^win/.test(process.platform);
var args = parseArgs(process.argv.slice(2), {
    // this option is to force minimist to decode 0x__ addresses as strings instead of numbers
    string: [
        'contract',
        'address',
        'account',
        'owner',
        'admin',
        'deploymentAdmins',
        'deploymentAdminProvider',
        'eventsContract',
        'superContract'
    ],
    default: {
        gas: 250000,
        ipc: isWin
            ? '\\\\.\\pipe\\geth.ipc'
            : '/tmp/greatCoin/data/geth.ipc'
    }
});

var operation = args._[0];
if (!operation) {
    //throw 'No operation specified';
    console.log('');
    console.log('  Usage: node 1.6.0_migrate-gooseberry-orders.js [operation] --contract 0x0000 --file orders.json [options]');
    console.log('');
    console.log('  Operations:');
    console.log('');
    console.log('    exportGooseberrySellOrders  Export all sell orders from Gooseberry gxOrders contract to a JSON file');
    console.log('    exportGooseberryBuyOrders   Export all buy orders from Gooseberry gxOrders contract to a JSON file');
    console.log('    importOrders                Import either buy or sell orders into GxOrderList data contract from JSON file');
    console.log('                                WARNING: your account must added as an owner on the GxOrderList data contract. Only deployment admins can add owners');
    console.log('    confirm                     Check orders in GxOrderList contract against orders in JSON file');
    console.log('    addOwner                    Adds an owner to the orders contract. --owner parameter must be specified. Account must be deployment admin on contract');
    console.log('    removeOwner                 Removes an owner to the orders contract. --owner parameter must be specified. Account must be deployment admin on contract');
    console.log('    isOwner                     Checks if --owner parameter is an owner to the orders contract. --owner parameter must be specified.');
    console.log('');
    console.log('  Required parameters:');
    console.log('');
    console.log('    --contract 0x00             Address of the contract. Which contract depends on the operation');
    console.log('    --file buy_orders.json      File path to read or write orders from/to, depending on the operation');
    console.log('');
    console.log('  Options:');
    console.log('');
    console.log('    --ipc ..\\geth.ipc           Optional, specify IPC path to use.');
    console.log('                                Defaults to \\\\.\\pipe\\geth.ipc');
    console.log('    --account 0x00...           Optional, which account to send transactions from. ');
    console.log('                                Defaults to web3.eth.coinbase');
    console.log('    --owner 0x00...             Required for "isOwner", "addOwner" and "removeOwner" operations. Which owner account to add/remove');
    console.log('    --admin 0x00...             Required for "isDeploymentAdmin" and "addDeploymentAdmin" operations. Which admin account to add/check');
    console.log('');
    console.log('  Example:');
    console.log('');
    console.log('    0x894846035eb8b31610cc550b9b4ce8396a0f5045 is the source orders contract');
    console.log('    0xd3f40b45db34c9018768a5465655ba625fc1910f is the destination buy orders data contract');
    console.log('    0x414d1a20fcc0b8a2e3eb1d8881dcccb110f31343 is the destination sell orders data contract');
    console.log('');
    console.log('    node 1.6.0_migrate-orders.js exportGooseberrySellOrders --contract 0x894846035eb8b31610cc550b9b4ce8396a0f5045 --file sellOrders.json');
    console.log('    node 1.6.0_migrate-orders.js importOrders --contract 0x414d1a20fcc0b8a2e3eb1d8881dcccb110f31343 --file sellOrders.json');
    console.log('    // wait for a few minutes for transactions to mine');
    console.log('    node 1.6.0_migrate-orders.js confirm --contract 0x414d1a20fcc0b8a2e3eb1d8881dcccb110f31343 --file sellOrders.json');
    console.log('');
    console.log('    node 1.6.0_migrate-orders.js exportGooseberryBuyOrders  --contract 0x894846035eb8b31610cc550b9b4ce8396a0f5045 --file buyOrders.json');
    console.log('    node 1.6.0_migrate-orders.js importOrders  --contract 0xd3f40b45db34c9018768a5465655ba625fc1910f --file buyOrders.json');
    console.log('    // wait for a few minutes for transactions to mine');
    console.log('    node 1.6.0_migrate-orders.js confirm --contract 0xd3f40b45db34c9018768a5465655ba625fc1910f --file buyOrders.json');
    console.log('');
    console.log('    // adding/removing/checking owners');
    console.log('    node 1.6.0_migrate-orders.js addOwner    --contract 0x414d1a20fcc0b8a2e3eb1d8881dcccb110f31343 --owner 0xbd411ae72a2bda59022cae92b77c022bf02d4847 --account 0xbd411ae72a2bda59022cae92b77c022bf02d4847');
    console.log('    node 1.6.0_migrate-orders.js isOwner     --contract 0x414d1a20fcc0b8a2e3eb1d8881dcccb110f31343 --owner 0xbd411ae72a2bda59022cae92b77c022bf02d4847');
    console.log('    node 1.6.0_migrate-orders.js removeOwner --contract 0x414d1a20fcc0b8a2e3eb1d8881dcccb110f31343 --owner 0xbd411ae72a2bda59022cae92b77c022bf02d4847 --account 0xbd411ae72a2bda59022cae92b77c022bf02d4847');
    console.log('');
    console.log('    // adding/checking deployment admins');
    console.log('    node 1.6.0_migrate-orders.js addDeploymentAdmin    --contract 0xfe845a732447cc0b1ea4a05cc4e50f3e07c69f2a --admin 0x2f7f08b633c560579ff3a31edf40aa5b532b79c8 --account 0xbd411ae72a2bda59022cae92b77c022bf02d4847');
    console.log('    node 1.6.0_migrate-orders.js isDeploymentAdmin     --contract 0xfe845a732447cc0b1ea4a05cc4e50f3e07c69f2a --admin 0x2f7f08b633c560579ff3a31edf40aa5b532b79c8');
    console.log('    node 1.6.0_migrate-orders.js removeDeploymentAdmin --contract 0xfe845a732447cc0b1ea4a05cc4e50f3e07c69f2a --admin 0x2f7f08b633c560579ff3a31edf40aa5b532b79c8 --account 0xbd411ae72a2bda59022cae92b77c022bf02d4847');
    console.log('');

    process.exit(0);
}

var migrate = require('./migrate-methods');

console.log('Using IPC path ' + args.ipc);
var web3 = new Web3(new Web3.providers.IpcProvider(args.ipc, require('net')));

var contract = args.contract;
if (!contract) {
    console.error('--contract parameter must be specified');
    process.exit(-1);
}

var file = args.file;
if (!contract) {
    console.error('--file parameter must be specified');
    process.exit(-1);
}

Promise.resolve()
    .then(() => getPrimaryAddress(web3, args.account))
    .then(account => {
        console.log('Using account ' + account);
        web3.eth.defaultAccount = account;
    })
    .then(() => {
        switch (operation) {
            case 'addOwner':
                checkArgument(args, 'owner');
                return migrate.addOwner(web3, contract, args.owner, args.gas);
            case 'removeOwner':
                checkArgument(args, 'owner');
                return migrate.removeOwner(web3, contract, args.owner, args.gas);
            case 'isOwner':
                checkArgument(args, 'owner');
                return migrate.isOwner(web3, contract, args.owner);

            case 'addDeploymentAdmin':
                checkArgument(args, 'admin');
                return migrate.addDeploymentAdmin(web3, contract, args.admin, args.gas);
            case 'removeDeploymentAdmin':
                checkArgument(args, 'admin');
                return migrate.removeDeploymentAdmin(web3, contract, args.admin, args.gas);
            case 'isDeploymentAdmin':
                checkArgument(args, 'admin');
                return migrate.isDeploymentAdmin(web3, contract, args.admin);

            case 'upgradeDeploymentAdmins':
                checkArgument(args, 'deploymentAdmins');
                return migrate.upgradeDeploymentAdmins(web3, contract, args.deploymentAdmins, args.gas);
            case 'upgradeDeploymentAdminProvider':
                checkArgument(args, 'deploymentAdminProvider');
                return migrate.upgradeDeploymentAdminProvider(web3, contract, args.deploymentAdminProvider, args.gas);
            case 'upgradeEventsContract':
                checkArgument(args, 'eventsContract');
                return migrate.upgradeEventsContract(web3, contract, args.eventsContract, args.gas);
            case 'upgradeSuperContract':
                checkArgument(args, 'superContract');
                return migrate.upgradeSuperContract(web3, contract, args.superContract, args.gas);

            case 'exportGooseberryBuyOrders':
                return migrate.exportGooseberryBuyOrders(web3, contract, file);
            case 'exportGooseberrySellOrders':
                return migrate.exportGooseberrySellOrders(web3, contract, file);

            case 'exportOrders':
                return migrate.exportOrders(web3, contract, file);
            case 'importOrders':
                return migrate.importOrdersFromFile(web3, contract, file);
            case 'confirm':
                return migrate.confirmOrdersFromFile(web3, contract, file);

            case 'exportTraders':
                return migrate.exportTraders(web3, contract, file);

            case 'exportAdmins':
                return migrate.exportAdmins(web3, contract, file);

            case 'exportDeploymentAdmins':
                return migrate.exportDeploymentAdmins(web3, contract, file);

            default:
                throw new Error('Invalid operation "' + operation + '"');
        }
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
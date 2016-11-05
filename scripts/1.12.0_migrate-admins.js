'use strict';

const Web3 = require('web3');
const fs = require('fs');
const _ = require('underscore');
const parseArgs = require('minimist');
const async = require('async');

const migrate = require('./migrate-methods');
const platformDeployment = require('./../lib/platformDeployment');
const transactionMethods = require('./../lib/transactionMethods');

var isWin = /^win/.test(process.platform);
var args = parseArgs(process.argv.slice(2), {
    // this option is to force minimist to decode 0x__ addresses as strings instead of numbers
    string: [
        'account',
        'parameters',
        'contract',
        'contractName'
    ],
    default: {
        parameters: '',
        contractName: 'GxAdmins',
        ipc: isWin
            ? '\\\\.\\pipe\\geth.ipc'
            : '/tmp/greatCoin/data/geth.ipc',
        blocks: 6,
        deploy: false,
        gas: 3000000 // pi millions: 3141592; tau millions: 4712388
    }
});

let libraries = [];

if (args.libraries) {
    libraries = JSON.parse(fs.readFileSync(args.libraries).toString());
}

let provider = args.rpc
    ? new Web3.providers.HttpProvider(args.rpc)
    : new Web3.providers.IpcProvider(args.ipc, require('net'));

console.log('Using geth @ ' + (provider.host || provider.path));
let web3 = new Web3(provider);

let contractName = args.contractName;

let contractSource = args.contractName + '.sol';
let parameters = args.parameters.split(',');

let deployedContract = migrate.getDeployedContract(web3, '../' + contractSource, contractName, args.contract);

let contract;
let admins;

Promise.resolve()

    .then(() => console.log('getting current admins from contract at ' + args.contract))
    .then(() => migrate.getAccounts(deployedContract, address => address))
    .then(result => admins = result)
    .then(() => console.log('got ' + admins.length + ' admins from contract at ' + args.contract))
    .then(() => console.log(JSON.stringify(admins, null, '  ')))

    .then(() => console.log('deploying new admins contract'))
    .then(() => platformDeployment.deploySingleContract(web3, args.account, contractSource, contractName, parameters, {
        blocks: args.blocks,
        gas: args.gas,
        libraries,
        sourceFolder: '../'
    }))
    .then(result => contract = result)
    .then(() => console.log('deployed new admins contract to ' + contract.address))

    .then(() => console.log('adding old admins to new contract at ' + contract.address))
    .then(() => {
        return new Promise((resolve, reject) => {
           async.timesSeries(
               admins.length,
               (n, next) => {
                   let admin = admins[n];
                   console.log('adding admin #' + (n + 1) + ' of ' + admins.length + ': ' + admin);
                   contract.contract.add(admin, {gas: args.gas}, next);
               },
               (error, transactionHashes) => {
                   if (error) {
                       reject(error);
                   } else {
                       resolve(transactionHashes);
                   }
               }
           );
        });
    })
    .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, args.blocks))
    .then(() => migrate.getAccounts(contract.contract, address => address))
    .then(newAdmins => {
        let missingAdmins = _.filter(admins, admin => !_.contains(newAdmins, admin));
        if (!_.isEmpty(missingAdmins)) {
            throw new Error('Some admins were not migrated: ' + JSON.stringify(missingAdmins, null, '  '));
        }
    })
    .then(() => console.log('done'))

    .catch(error => {
        console.error(error);
        if (error.stack) {
            console.error(error.stack);
        }
    })
    // this is like a "finally" call
    .then(() => web3.currentProvider.connection.end());
'use strict';

const _ = require('underscore');
const async = require('async');

const solcWrapper = require('./solcWrapper');
const deploymentMethods = require('./deploymentMethods');
const contractMethods = require('./contractMethods');
const transactionMethods = require('./transactionMethods');

const CONTRACT = {
    GX_ADMIN_OPERATIONS: 'GxAdminOperations',
    GX_ADMINS: 'GxAdmins',
    GX_BUY_ORDERS: 'GxBuyOrders',
    GX_CANCEL_ORDERS: 'GxCancelOrders',
    GX_COIN: 'GxCoin',
    GX_COIN_TOTALS: 'GxCoinTotals',
    GX_CONSTANTS: 'GxConstants',
    GX_DEPLOYMENT_ADMINS: 'GxDeploymentAdmins',
    GX_EVENTS: 'GxEvents',
    GX_MANAGED_WALLET: 'GxManagedWallet',
    GX_ORDER_LIST: 'GxOrderList',
    GX_ORDERS: 'GxOrders',
    GX_SELL_ORDERS: 'GxSellOrders',
    GX_TRADERS: 'GxTraders',
    GX_TRADERS_PROXY: 'GxTradersProxy',

    ITERABLE_ADDRESS_MAPPING: 'IterableAddressMapping',
    ITERABLE_ADDRESS_BALANCE_MAPPING: 'IterableAddressBalanceMapping'
};

/**
 * Allows promises to be run sequentially. Used for sending multiple transactions one after each other,
 * instead of all at the same time. This helps avoid nonce errors during deployment
 * @param promiseFunctions
 * @returns {Promise}
 */
Promise.series = function(promiseFunctions) {
    if (!Array.isArray(promiseFunctions)) {
        throw new TypeError('You must pass an array to Promise.series().');
    }

    return new Promise(function(resolve, reject) {
        function runPromise(i, callback) {
            let promiseFunction = promiseFunctions[i];
            let promise = promiseFunction();

            if (promise && typeof promise.then === 'function') {
                promise.then(result => callback(null, result), error => callback(error));
            } else {
                callback(null, promise);
            }
        }

        async.timesSeries(
            promiseFunctions.length,
            runPromise,
            (error, results) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(results);
                }
            });
    });
};

module.exports = {
    /**
     *
     * @param web3
     * @param deploymentAccount
     * @param contractSource
     * @param contractName
     * @param constructorParameters
     * @param options
     * @returns {*}
     */
    deploySingleContract: function(web3, deploymentAccount, contractSource, contractName, constructorParameters, options) {
        var blocks = options.blocks;
        var gasPrice = options.gasPrice;
        var libraries = options.libraries;
        var sourceFolder = options.sourceFolder;
        let optimize = 1;

        if (_.isUndefined(sourceFolder)) {
            sourceFolder = './';
        }

        var solcOutput = solcWrapper.compile([contractSource], optimize, sourceFolder);

        if (solcOutput.errors) {
            console.log('Compilation errors! See below:');
            console.log(solcOutput.errors);
            return Promise.reject();
        }

        if (!libraries) {
            libraries = [];
        }

        var iterableAddressMapping = solcWrapper.buildContractFromSolcOutput(web3, solcOutput, 'IterableAddressMapping');
        var iterableAddressBalanceMapping = solcWrapper.buildContractFromSolcOutput(web3, solcOutput, 'IterableAddressBalanceMapping');

        let contract = solcWrapper.buildContractFromSolcOutput(web3, solcOutput, contractName);

        return Promise.resolve()
            .then(() => {
                console.log('Using deployment account: ' + deploymentAccount);
                web3.eth.defaultAccount = deploymentAccount;
            })
            .then(() => {
                if (!_.isEmpty(libraries)) {
                    console.log('Using existing libraries ...');

                    return;
                }

                this.log('Deploying libraries ...');
                return Promise.all([
                    contractMethods.deployLibrary(web3, iterableAddressMapping, {libraries, blocks, gasPrice}),
                    contractMethods.deployLibrary(web3, iterableAddressBalanceMapping, {libraries, blocks, gasPrice})
                ]).then(() => {
                    libraries.push({
                        name: iterableAddressBalanceMapping.name,
                        address: iterableAddressBalanceMapping.address
                    }, {
                        name: iterableAddressMapping.name,
                        address: iterableAddressMapping.address
                    });

                });
            })
            .then(() => this.log('libraries: ' + JSON.stringify(libraries, null, '  ')))
            .then(() => contractMethods.deployContract(web3, contract, constructorParameters, {libraries, blocks, gasPrice}))
            .then(() => {
                this.log('Deployed ' + contract.name + ' to ' + contract.address);

                // resolve with the contract object
                return contract;
            })
            .catch(error => {
                console.error(error);
                if (error.stack) {
                    console.error(error.stack);
                }

                throw error;
            });
    },
    /**
     *
     * @param web3
     * @param deploymentAccount
     * @param options
     * @returns {*}
     */
    deployAllContracts: function(web3, deploymentAccount, options) {
        var blocks = options.blocks;
        var gas = options.gas || 150000; // 200k gas is enough for all transactions
        var gasPrice = options.gasPrice;
        var existingContracts = options.existingContracts;
        var libraries = options.libraries;
        var onlyCompile = options.onlyCompile;
        if (!existingContracts) {
            existingContracts = {};
        }

        var nonce = options.nonce;

        /**
         *
         * @param web3
         * @param contract
         * @param existingContract
         * @param parameters
         * @returns {Promise}
         */
        let deployOrUseExistingContract = (web3, contract, existingContract, parameters) => {
            return Promise.resolve()
                .then(() => {
                    if (_.isUndefined(existingContract)) {
                        return contractMethods.deployContract(web3, contract, parameters, { libraries, gasPrice, nonce: nonce++ });
                    } else {
                        return contractMethods.useExistingContract(web3, contract, existingContract);
                    }
                })
                .then(() => ({
                    contract,
                    existingContract,
                    parameters
                }));
        };

        /**
         *
         * @param web3
         * @param contract
         * @param existingContract
         * @param parameters
         * @returns {*}
         */
        let confirmContract = (web3, contract, existingContract, parameters) => {
            if (_.isUndefined(existingContract)) {
                return contractMethods.confirmContract(web3, contract, { blocks });
            }

            // these contracts all take 'GxDeploymentAdmins.address' as constructor parameter
            // so if we are using existing contract, we have to change the deployment admins reference
            const contractsCallableByDeploymentAdmins = [
                CONTRACT.GX_ADMINS,
                CONTRACT.GX_COIN,
                CONTRACT.GX_EVENTS,
                CONTRACT.GX_SELL_ORDERS,
                CONTRACT.GX_BUY_ORDERS,
                CONTRACT.GX_MANAGED_WALLET,
                CONTRACT.GX_ORDERS,
                CONTRACT.GX_CANCEL_ORDERS,
                CONTRACT.GX_TRADERS_PROXY,
                CONTRACT.GX_COIN_TOTALS,
                CONTRACT.GX_ADMIN_OPERATIONS
            ];

            return Promise.resolve()
                .then(() => {
                    if (contract.name === CONTRACT.GX_DEPLOYMENT_ADMINS) {
                        return contract.promised.contains(web3.eth.defaultAccount);
                    } else if (_.isFunction(contract.promised.isDeploymentAdmin)) {
                        return contract.promised.isDeploymentAdmin(web3.eth.defaultAccount);
                    } else {
                        return undefined; // some contracts don't have deployment admins - like GxConstants
                    }
                })
                .then(isDeploymentAdmin => {
                    if (isDeploymentAdmin === false) {
                        throw 'Not deployment admin on contract ' + contract.name + ' at ' + contract.address;
                    } else if (isDeploymentAdmin === true) {
                        this.log('Confirmed as deployment admin on contract ' + contract.name + ' at ' + contract.address);
                    } else {
                        // do nothing
                    }
                })
                .then(() => {
                    this.log('Linking existing ' + existingContract.name + ' contract');

                    if (contract.name === CONTRACT.GX_TRADERS) {
                        let gxCoinAddress = parameters[0];

                        return Promise.resolve()
                            .then(() => contract.promised.greatCoinContract())
                            .then(currentGxCoinContract => {
                                if (currentGxCoinContract === gxCoinAddress) {
                                    this.log('contract ' + contract.name + ' is already linked to current GxCoin contract');
                                    return Promise.resolve();
                                } else {
                                    return Promise.resolve()
                                        .then(() => contract.promised.upgradeGreatCoin(parameters[0], { gas, gasPrice, nonce: nonce++ }))
                                        .then(transactionHash =>
                                            transactionMethods.confirmTransaction(web3, transactionHash, blocks));
                                }
                            });
                    }

                    if (_.contains(contractsCallableByDeploymentAdmins, contract.name)) {
                        let deploymentAdminsAddress = parameters[0];

                        this.log('linking ' + contract.name + ' to deployment admins');

                        return Promise.resolve()
                            .then(() => contract.promised.deploymentAdmins())
                            .then(currentDeploymentAdminsAddress => {
                                if (currentDeploymentAdminsAddress === deploymentAdminsAddress) {
                                    this.log('contract ' + contract.name + ' is already linked to current GxDeploymentAdmins contract');
                                    return Promise.resolve();
                                }

                                var method = contract.promised.upgradeDeploymentAdmins ||
                                    contract.promised.setDeploymentAdminsContract;

                                return Promise.resolve()
                                    .then(() => method(deploymentAdminsAddress, { gas, gasPrice, nonce: nonce++ }))
                                    .then(transactionHash =>
                                        transactionMethods.confirmTransaction(web3, transactionHash, blocks));
                            });
                    }
                });
        };

        let capitalize = string => string.charAt(0).toUpperCase() + string.slice(1);

        /**
         *
         * @param contract
         * @param property
         * @param value
         * @param {String} [setter]
         * @returns {Promise}
         */
        let setContractProperty = (contract, property, value, setter) => {
            return Promise.resolve()
                .then(() => contract.promised[property]())
                .then(propertyValue => {
                    if (propertyValue === value) {
                        this.log('property "' + property + '" on contract ' + contract.name + ' is already correctly set');
                        return undefined;
                    } else {
                        if (_.isUndefined(setter)) {
                            // Build a setter in our most common format
                            // e.g. for contract 'admins' the setter is 'setAdminsContract'
                            setter = `set${capitalize(property)}Contract`;
                        }

                        return contract.promised[setter](value, { gas, gasPrice, nonce: nonce++ });
                    }
                });
        };

        /**
         *
         * @param contract
         * @param owner
         * @returns {*}
         */
        let addOwner = (contract, owner) => {
            return contract.promised.isOwner(owner)
                .then(isOwner => {
                    if (isOwner) {
                        this.log('address ' + owner + ' is already owner on contract ' + contract.name);
                        return undefined;
                    } else {
                        return contract.promised.addOwner(owner, {gas, gasPrice, nonce: nonce++});
                    }
                });
        };

        let optimize = 1;
        let sources = [
            CONTRACT.GX_ADMINS,
            CONTRACT.GX_COIN,
            CONTRACT.GX_DEPLOYMENT_ADMINS,
            CONTRACT.GX_ORDER_LIST,
            CONTRACT.GX_TRADERS,
            CONTRACT.GX_TRADERS_PROXY,
            CONTRACT.GX_ORDERS,
            CONTRACT.GX_CANCEL_ORDERS,
            CONTRACT.GX_EVENTS,
            CONTRACT.GX_MANAGED_WALLET,
            CONTRACT.GX_COIN_TOTALS,
            CONTRACT.GX_ADMIN_OPERATIONS
        ];

        var solcOutput = solcWrapper.compile(sources, optimize, './');

        if (solcOutput.errors) {
            this.log('Compilation errors! See below:');
            this.log(solcOutput.errors);
            return Promise.reject();
        }

        var contracts = {
            GxDeploymentAdmins: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_DEPLOYMENT_ADMINS),
            GxAdmins: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_ADMINS),
            GxTraders: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_TRADERS),
            GxTradersProxy: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_TRADERS_PROXY),
            GxOrders: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_ORDERS),
            GxCancelOrders: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_CANCEL_ORDERS),
            GxCoin: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_COIN),
            GxBuyOrders: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_ORDER_LIST, CONTRACT.GX_BUY_ORDERS),
            GxSellOrders: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_ORDER_LIST, CONTRACT.GX_SELL_ORDERS),
            GxConstants: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_CONSTANTS),
            GxEvents: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_EVENTS),
            GxManagedWallet: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_MANAGED_WALLET),
            GxCoinTotals: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_COIN_TOTALS),
            GxAdminOperations: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.GX_ADMIN_OPERATIONS),

            IterableAddressMapping: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.ITERABLE_ADDRESS_MAPPING),
            IterableAddressBalanceMapping: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, CONTRACT.ITERABLE_ADDRESS_BALANCE_MAPPING)
        };

        var contractLinks = [
            {
                contract: contracts.GxTraders,
                properties: {
                    greatCoinContract: contracts.GxTradersProxy,
                    gxOrdersContract: contracts.GxTradersProxy
                }
            },
            {
                contract: contracts.GxCoin,
                properties: {
                    constants: contracts.GxConstants,
                    coinTotals: contracts.GxCoinTotals,
                    deploymentAdmins: contracts.GxDeploymentAdmins,
                    events: contracts.GxEvents,
                    gxCoin: contracts.GxCoin,
                    traders: contracts.GxTraders,
                    tradersProxy: contracts.GxTradersProxy,
                    wallet: contracts.GxManagedWallet
                }
            },
            {
                contract: contracts.GxOrders,
                properties: {
                    constants: contracts.GxConstants,
                    deploymentAdmins: contracts.GxDeploymentAdmins,
                    events: contracts.GxEvents,
                    gxCoin: contracts.GxCoin,
                    traders: contracts.GxTraders,
                    tradersProxy: contracts.GxTradersProxy,
                    wallet: contracts.GxManagedWallet
                }
            },
            {
                contract: contracts.GxCancelOrders,
                properties: {
                    admins: contracts.GxAdmins,
                    constants: contracts.GxConstants,
                    deploymentAdmins: contracts.GxDeploymentAdmins,
                    events: contracts.GxEvents,
                    gxCoin: contracts.GxCoin,
                    traders: contracts.GxTraders,
                    tradersProxy: contracts.GxTradersProxy,
                    wallet: contracts.GxManagedWallet
                }
            },
            {
                contract: contracts.GxEvents,
                owners: [
                    contracts.GxCoin,
                    contracts.GxOrders,
                    contracts.GxCancelOrders
                ],
                properties: {
                    deploymentAdmins: contracts.GxDeploymentAdmins
                }
            },
            {
                contract: contracts.GxManagedWallet,
                owners: [
                    contracts.GxCoin,
                    contracts.GxOrders,
                    contracts.GxCancelOrders
                ],
                properties: {
                    deploymentAdmins: contracts.GxDeploymentAdmins
                }
            },
            {
                contract: contracts.GxTradersProxy,
                owners: [
                    contracts.GxAdminOperations,
                    contracts.GxCoin,
                    contracts.GxOrders,
                    contracts.GxCancelOrders
                ],
                properties: {
                    deploymentAdmins: contracts.GxDeploymentAdmins
                }
            },
            {
                contract: contracts.GxBuyOrders,
                owners: [
                    contracts.GxOrders,
                    contracts.GxCancelOrders
                ],
                properties: {
                    deploymentAdmins: contracts.GxDeploymentAdmins
                }
            },
            {
                contract: contracts.GxSellOrders,
                owners: [
                    contracts.GxOrders,
                    contracts.GxCancelOrders
                ],
                properties: {
                    deploymentAdmins: contracts.GxDeploymentAdmins
                }
            },
            {
                contract: contracts.GxCoinTotals,
                owners: [
                    contracts.GxCoin,
                    contracts.GxAdminOperations
                ],
                properties: {
                    deploymentAdmins: contracts.GxDeploymentAdmins
                }
            },
            {
                contract: contracts.GxAdminOperations,
                properties: {
                    admins: contracts.GxAdmins,
                    constants: contracts.GxConstants,
                    coinTotals: contracts.GxCoinTotals,
                    deploymentAdmins: contracts.GxDeploymentAdmins,
                    events: contracts.GxEvents,
                    traders: contracts.GxTraders,
                    tradersProxy: contracts.GxTradersProxy,
                    wallet: contracts.GxManagedWallet
                }
            }
        ];

        if (onlyCompile) {
            return Promise.resolve(contracts);
        }

        /**
         * The deployment steps go like this:
         * 1. Deploy the libraries;
         * 2. Get the addresses of the libraries, getLibraryAddresses(),
         *    exit the function by deploying the greatCoin contract, with deployGreatCoin();
         * 3. Get the address of the greatCoin contract, getContractAddress(),
         *    exit the function by deploying the gxTraders, gxOrders subcontract, with deploySubcontracts();
         * 4. Get the addresses of the subcontracts, getSubcontractAddresses(),
         *    exit the function by adding the subcontract to the greatCoin contract, with linkAdminTradersOrdersContracts();
         * 5. Confirm that the subcontract is added to the greatCoin contract, getContractUpdateAddress();
         * 6. After all the above, generate the greatCoin.js file.
         *
         * Note that the deploymentAdmins and gxAdmins contract are created from the greatCoin contract constructor.
         */
        return Promise.resolve()
            .then(() => {
                this.log('Using deployment account: ' + deploymentAccount);
                web3.eth.defaultAccount = deploymentAccount;
            })
            .then(() => new Promise((resolve, reject) => {
                web3.eth.getTransactionCount(web3.eth.defaultAccount, (error, count) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(count);
                    }
                });
            }))
            .then(count => {
                nonce = nonce || count;
                this.log('using nonce ' + nonce + '; transaction count is ' + count);
            })
            .then(() => new Promise((resolve, reject) => {
                web3.eth.getGasPrice((error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                });
            }))
            .then(marketGasPrice => {
                gasPrice = gasPrice || marketGasPrice;
                let gasPriceMultiplier = (gasPrice / marketGasPrice).toFixed(2);
                this.log('using ' + gasPrice  + ' gas price, which is ' + gasPriceMultiplier + 'X of market price');
            })
            .then(() => {
                this.log('using ' + gas + ' gas for transaction deployment');
            })
            .then(() => {
                if (!_.isEmpty(libraries)) {
                    this.log('Using existing libraries ...');

                    return;
                }

                this.log('Deploying libraries ...');
                return Promise.series([
                    () => contractMethods.deployLibrary(web3, contracts.IterableAddressMapping, {libraries, blocks, gasPrice, nonce: nonce++ }),
                    () => contractMethods.deployLibrary(web3, contracts.IterableAddressBalanceMapping, {libraries, blocks, gasPrice, nonce: nonce++ })
                ]).then(() => {
                    libraries = [
                        {
                            name: contracts.IterableAddressBalanceMapping.name,
                            address: contracts.IterableAddressBalanceMapping.address
                        },
                        {
                            name: contracts.IterableAddressMapping.name,
                            address: contracts.IterableAddressMapping.address
                        }
                    ];
                });
            })
            .then(() => deployOrUseExistingContract(web3, contracts.GxDeploymentAdmins, existingContracts.GxDeploymentAdmins, []))
            .then(() => confirmContract(web3, contracts.GxDeploymentAdmins, existingContracts.GxDeploymentAdmins))

            .then(() => {
                let deploymentAdminsAddress = contracts.GxDeploymentAdmins.address;

                return Promise.series([
                    () => deployOrUseExistingContract(web3, contracts.GxCoin,
                        existingContracts.GxCoin, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxEvents,
                        existingContracts.GxEvents, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxSellOrders,
                        existingContracts.GxSellOrders, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxBuyOrders,
                        existingContracts.GxBuyOrders, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxManagedWallet,
                        existingContracts.GxManagedWallet, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxOrders,
                        existingContracts.GxOrders, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxCancelOrders,
                        existingContracts.GxCancelOrders, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxTradersProxy,
                        existingContracts.GxTradersProxy, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxConstants,
                        existingContracts.GxConstants, []),
                    () => deployOrUseExistingContract(web3, contracts.GxAdmins,
                        existingContracts.GxAdmins, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxCoinTotals,
                        existingContracts.GxCoinTotals, [deploymentAdminsAddress]),
                    () => deployOrUseExistingContract(web3, contracts.GxAdminOperations,
                        existingContracts.GxAdminOperations, [deploymentAdminsAddress])
                ]);
            })
            .then(results => Promise.all(_.map(results, result =>
                confirmContract(web3, result.contract, result.existingContract, result.parameters))))

            .then(() => deployOrUseExistingContract(web3, contracts.GxTraders,
                    existingContracts.GxTraders, [contracts.GxTradersProxy.address]))
            .then(result => confirmContract(web3, result.contract, result.existingContract, result.parameters))

            .then(() => Promise.series([
                () => this.log('Linking GxCoin contract...'),
                () => setContractProperty(contracts.GxCoin, 'admins', contracts.GxAdmins.address),
                () => setContractProperty(contracts.GxCoin, 'constants', contracts.GxConstants.address),
                () => setContractProperty(contracts.GxCoin, 'traders', contracts.GxTraders.address),
                () => setContractProperty(contracts.GxCoin, 'tradersProxy', contracts.GxTradersProxy.address),
                () => setContractProperty(contracts.GxCoin, 'events', contracts.GxEvents.address),
                () => setContractProperty(contracts.GxCoin, 'wallet', contracts.GxManagedWallet.address),
                () => setContractProperty(contracts.GxCoin, 'coinTotals', contracts.GxCoinTotals.address),

                () => this.log('Linking GxOrders contract...'),
                () => setContractProperty(contracts.GxOrders, 'traders', contracts.GxTraders.address),
                () => setContractProperty(contracts.GxOrders, 'tradersProxy', contracts.GxTradersProxy.address),
                () => setContractProperty(contracts.GxOrders, 'events', contracts.GxEvents.address),
                () => setContractProperty(contracts.GxOrders, 'wallet', contracts.GxManagedWallet.address),
                () => setContractProperty(contracts.GxOrders, 'gxCoin', contracts.GxCoin.address),
                () => setContractProperty(contracts.GxOrders, 'buyOrders', contracts.GxBuyOrders.address),
                () => setContractProperty(contracts.GxOrders, 'sellOrders', contracts.GxSellOrders.address),
                () => setContractProperty(contracts.GxOrders, 'constants', contracts.GxConstants.address),


                () => this.log('Linking GxCancelOrders contract...'),
                () => setContractProperty(contracts.GxCancelOrders, 'constants', contracts.GxConstants.address),
                () => setContractProperty(contracts.GxCancelOrders, 'traders', contracts.GxTraders.address),
                () => setContractProperty(contracts.GxCancelOrders, 'tradersProxy', contracts.GxTradersProxy.address),
                () => setContractProperty(contracts.GxCancelOrders, 'events', contracts.GxEvents.address),
                () => setContractProperty(contracts.GxCancelOrders, 'wallet', contracts.GxManagedWallet.address),
                () => setContractProperty(contracts.GxCancelOrders, 'gxCoin', contracts.GxCoin.address),
                () => setContractProperty(contracts.GxCancelOrders, 'buyOrders', contracts.GxBuyOrders.address),
                () => setContractProperty(contracts.GxCancelOrders, 'sellOrders', contracts.GxSellOrders.address),
                () => setContractProperty(contracts.GxCancelOrders, 'admins', contracts.GxAdmins.address),

                () => this.log('Linking GxAdminOperations contract...'),
                () => setContractProperty(contracts.GxAdminOperations, 'constants', contracts.GxConstants.address),
                () => setContractProperty(contracts.GxAdminOperations, 'traders', contracts.GxTraders.address),
                () => setContractProperty(contracts.GxAdminOperations, 'tradersProxy', contracts.GxTradersProxy.address),
                () => setContractProperty(contracts.GxAdminOperations, 'events', contracts.GxEvents.address),
                () => setContractProperty(contracts.GxAdminOperations, 'wallet', contracts.GxManagedWallet.address),
                () => setContractProperty(contracts.GxAdminOperations, 'admins', contracts.GxAdmins.address),
                () => setContractProperty(contracts.GxAdminOperations, 'coinTotals', contracts.GxCoinTotals.address),

                () => this.log('Linking GxTraders contracts...'),
                () => setContractProperty(contracts.GxTradersProxy, 'traders', contracts.GxTraders.address),
                () => setContractProperty(contracts.GxTradersProxy, 'admins', contracts.GxAdmins.address),

                () => this.log('Linking GxTradersProxy contracts...'),
                () => setContractProperty(contracts.GxTraders, 'gxOrdersContract', contracts.GxTradersProxy.address, 'addOrderContract')
            ]))
            .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, blocks))

            .then(() => this.log('Adding owners...'))
            .then(() => Promise.series([
                () => addOwner(contracts.GxEvents, contracts.GxCoin.address),
                () => addOwner(contracts.GxEvents, contracts.GxAdminOperations.address),
                () => addOwner(contracts.GxEvents, contracts.GxOrders.address),
                () => addOwner(contracts.GxEvents, contracts.GxCancelOrders.address),
                () => addOwner(contracts.GxManagedWallet, contracts.GxCoin.address),
                () => addOwner(contracts.GxManagedWallet, contracts.GxAdminOperations.address),
                () => addOwner(contracts.GxManagedWallet, contracts.GxOrders.address),
                () => addOwner(contracts.GxManagedWallet, contracts.GxCancelOrders.address),
                () => addOwner(contracts.GxTradersProxy, contracts.GxCoin.address),
                () => addOwner(contracts.GxTradersProxy, contracts.GxAdminOperations.address),
                () => addOwner(contracts.GxTradersProxy, contracts.GxOrders.address),
                () => addOwner(contracts.GxTradersProxy, contracts.GxCancelOrders.address),
                () => addOwner(contracts.GxSellOrders, contracts.GxOrders.address),
                () => addOwner(contracts.GxSellOrders, contracts.GxCancelOrders.address),
                () => addOwner(contracts.GxBuyOrders, contracts.GxOrders.address),
                () => addOwner(contracts.GxBuyOrders, contracts.GxCancelOrders.address),
                () => addOwner(contracts.GxCoinTotals, contracts.GxCoin.address),
                () => addOwner(contracts.GxCoinTotals, contracts.GxAdminOperations.address)
            ]))
            .then(transactionHashes => transactionMethods.confirmTransactions(web3, transactionHashes, blocks))
            .then(() => {
                let contractsWithProperties = _.filter(contractLinks, link => !_.isEmpty(link.properties));

                return Promise.all(_.map(contractsWithProperties, link => {
                    let contract = link.contract;
                    let properties = link.properties;

                    this.log('Checking ' +  contract.name  + ' contract properties ...');

                    return Promise.all(_.map(properties, (expected, property) => {
                        if (!_.isFunction(contract.promised[property])) {
                            return Promise.reject('Contract ' + contract.name + ' does not not have a property "' + property + '"');
                        }

                        return contract.promised[property]()
                            .then(referenceAddress => {
                                if (referenceAddress !== expected.address) {
                                    throw 'Contract ' + contract.name + ' does not have correct ' + property + ' property.\n' +
                                    'Expected ' + expected.address + ' address for ' + expected.name + ' contract, got ' + referenceAddress;
                                }
                            });
                    }));
                }));
            })
            .then(() => {
                let contractsWithOwners = _.filter(contractLinks, link => !_.isEmpty(link.owners));

                return Promise.all(_.map(contractsWithOwners, link => {
                    let contract = link.contract;
                    let owners = link.owners;

                    this.log('Checking ' +  contract.name  + ' contract owners ...');

                    return Promise.all(_.map(owners, owner => {
                        return contract.promised
                            .isOwner(owner.address)
                            .then(isOwner => {
                                if (!isOwner) {
                                    throw 'Contract ' + owner.name + ' is not an owner on ' + contract.name;
                                }
                            });
                    }));
                }));
            })
            .then(() => {
                // resolve the promise with 'contracts'
                return contracts;
            })
            .catch(error => {
                console.error(error);
                if (error.stack) {
                    console.error(error.stack);
                }

                if (error instanceof Error) {
                    throw error;
                } else {
                    throw new Error(error);
                }
            });
    },
    log(/*arguments*/) {
        console.log.apply(this, arguments);
    }
};
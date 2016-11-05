'use strict';

var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var async = require('async');
var promisify = require('es6-promisify');
var json2xls = require('json2xls');

var chai = require('chai');
chai.use(require('chai-string'));
var assert = chai.assert;

var solcWrapper = require('./../lib/solcWrapper');

module.exports = {
    getContractDefinition(web3, sourceFiles, contractName, sourceFolder) {
        var solcOutput = solcWrapper.compile(sourceFiles, 1, sourceFolder);
        var contractInfo = solcWrapper.buildContractFromSolcOutput(web3, solcOutput, contractName);

        return contractInfo.definition;
    },

    /**
     *
     * @param web3
     * @param sourceFiles
     * @param contractName
     * @param contractAddress
     * @param sourceFolder
     * @returns {Object}
     */
    getDeployedContract(web3, sourceFiles, contractName, contractAddress, sourceFolder) {
        var definition = this.getContractDefinition(web3, sourceFiles, contractName, sourceFolder);
        return definition.at(contractAddress);
    },

    /**
     *
     * @param web3
     * @param contractName
     * @param abi
     * @param address
     * @returns {{name: *, abi: *, definition: *, address: *, contract: *}}
     */
    buildContractFromAbi(web3, contractName, abi, address) {
        let definition, contract;
        if (abi && address) {
            definition = web3.eth.contract(abi);
            contract = definition.at(address);
        }

        //noinspection JSValidateTypes
        return {
            name: contractName,
            abi: abi,
            definition: definition,
            address: address,
            contract: contract
        };
    },

    toOrderObjectFromOldOrder(orderResult) {
        return {
            orderId: orderResult[0].toNumber(),
            nextId: orderResult[1].toNumber(),
            account: orderResult[2],
            quantity: orderResult[3].toNumber(),
            pricePerCoin: orderResult[4].toNumber(),
            originalQuantity: orderResult[5].toNumber(),
            expirationTime: orderResult[6].toNumber()
        };
    },

    toOrderObject(orderResult) {
        if (!orderResult) {
            throw new Error('orderResult is not defined');
        }

        if (!_.isArray(orderResult)) {
            throw new Error('orderResult is not an object');
        }

        if (orderResult.length < 8) {
            throw new Error('orderResult array must have at least 8 elements');
        }

        return {
            orderId: orderResult[0].toNumber(),
            next: orderResult[1].toNumber(),
            previous: orderResult[2].toNumber(),
            account: orderResult[3],
            quantity: orderResult[4].toNumber(),
            originalQuantity: orderResult[5].toNumber(),
            pricePerCoin: orderResult[6].toNumber(),
            expirationTime: orderResult[7].toNumber()
        };
    },

    checkOrder(contractOrder, exportedOrder) {
        assert.equal(contractOrder.orderId, exportedOrder.orderId, 'Orders have different orderId');
        assert.equal(contractOrder.next, exportedOrder.nextId, 'Orders have different nextId');
        assert.equal(contractOrder.account, exportedOrder.account, 'Orders have different account');
        assert.equal(contractOrder.quantity, exportedOrder.quantity, 'Orders have different quantity');
        assert.equal(contractOrder.originalQuantity, exportedOrder.originalQuantity, 'Orders have different originalQuantity');
        assert.equal(contractOrder.pricePerCoin, exportedOrder.pricePerCoin, 'Orders have different pricePerCoin');
    },

    /**
     *
     * @param orderSummary
     * @returns {{firstId: *, count: *, maxId: *}}
     */
    toOrderSummary(orderSummary) {
        return {
            firstId: orderSummary[0].toNumber(),
            count: orderSummary[1].toNumber(),
            maxId: orderSummary[2].toNumber()
        };
    },

    getGooseberryBuyOrders(gooseberryOrdersContract) {
        console.log('Getting buy orders from Gooseberry contract ...');
        return this._getGooseberryOrders(
            gooseberryOrdersContract.getBuyOrdersInfo,
            gooseberryOrdersContract.getBuyOrder);
    },

    getGooseberrySellOrders(gooseberryOrdersContract) {
        console.log('Getting sell orders from Gooseberry contract ...');
        return this._getGooseberryOrders(
            gooseberryOrdersContract.getSellOrdersInfo,
            gooseberryOrdersContract.getSellOrder);
    },

    getOrders(contract) {
        console.log('Getting orders from Habanero contract ...');

        var result = {};
        var orders = [];
        var getOrderPromise = promisify(contract.get);
        return Promise.all([
            promisify(contract.size)().then(size =>
                result.size = size.toNumber()),

            promisify(contract.first)().then(first =>
                result.first = first.toNumber()),

            promisify(contract.nextOrderId)().then(nextOrderId =>
                result.maxId = nextOrderId.toNumber() - 1)
        ]).then(() => {
            let nextOrderId = result.first;

            console.log('Exporting ' + result.size + ' orders');

            return new Promise((resolve, reject) => {
                async.doWhilst(
                    callback => {
                        getOrderPromise(nextOrderId)
                            .then(this.toOrderObject)
                            .then(order => {
                                // this is only to match old order format
                                order.nextId = order.next;
                                nextOrderId = order.next;

                                delete order.next;
                                delete order.prev;

                                orders.push(order);

                                callback();
                            });
                    },
                    () => nextOrderId !== 0,
                    (err, res) => {
                        if (err) {
                            reject(err);
                        } else {
                            result.orders = orders;
                            resolve(result);
                        }
                    }
                );
            });
        });
    },

    /**
     *
     * @param contract
     * @param buildAccountFromAddress
     * @returns {Promise}
     */
    getAccounts(contract, buildAccountFromAddress) {
        console.log('Getting accounts ...');
        var accounts = [];
        var getter = promisify(contract.iterateGet);
        var isValidIteration = promisify(contract.iterateValid);

        let iterationNumber, iterationValid;

        return Promise.resolve()
            .then(() => promisify(contract.iterateStart)())
            .then(iterateStart => iterationNumber = iterateStart.toNumber())
            .then(() => isValidIteration(iterationNumber))
            .then(isValid => iterationValid = isValid)
            .then(() => new Promise((resolve, reject) => {
                async.whilst(
                    () => iterationValid,
                    callback => Promise.resolve()
                        .then(() => getter(iterationNumber))
                        .then(address => {
                            if (address !== '0x0000000000000000000000000000000000000000') {
                                return buildAccountFromAddress(address);
                            } else {
                                return {};
                            }
                        })
                        .then(account => {
                            if (!_.isEmpty(account)) {
                                accounts.push(account);
                            }
                        })
                        .then(() => {
                            if (iterationNumber % 100 === 0) {
                                console.log('account: ' + iterationNumber);
                            }

                            iterationNumber++;
                        })
                        .then(() => isValidIteration(iterationNumber))
                        .then(isValid => iterationValid = isValid)
                        .then(() => {
                            callback();
                        }),
                    (err, res) => {
                        if (err) {
                            reject(err);
                        } else {
                            console.log('account: ' + iterationNumber);
                            resolve(accounts);
                        }
                    });
            }));
    },

    /**
     *
     * @param getOrdersInfoFunction
     * @param getOrderFunction
     * @returns {Promise}
     * @private
     */
    _getGooseberryOrders(getOrdersInfoFunction, getOrderFunction) {
        var orders = [];
        var getOrderPromise = promisify(getOrderFunction);
        return new Promise((resolve, reject) => {

            getOrdersInfoFunction((err, result) => {
                if (err) {
                    return reject(err);
                }

                let info = this.toOrderSummary(result);
                let nextOrderId = info.firstId;

                console.log('Exporting ' + info.count + ' orders');

                async.doWhilst(
                    callback => {
                        getOrderPromise(nextOrderId)
                            .then(this.toOrderObjectFromOldOrder)
                            .then(order => {
                                orders.push(order);
                                nextOrderId = order.nextId;
                                callback();
                            });
                    },
                    () => nextOrderId !== 0,
                    (err, res) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                first: info.firstId,
                                size: info.count,
                                maxId: info.maxId,
                                orders: orders
                            });
                        }
                    }
                );
            });
        });
    },

    checkOwner: function(ownableContract, address) {
        return new Promise((resolve, reject) => {
            ownableContract.isOwner(address, function(err, result) {
                if (err) {
                    reject(err);
                } else if (!result) {
                    reject('Account ' + address + ' is not owner on contract at ' + ownableContract.address);
                } else {
                    resolve();
                }
            });
        });
    },

    addOrders: function(addOrderFunction, orders) {
        var addOrderPromise = promisify(addOrderFunction);

        var index = 0;

        return new Promise((resolve, reject) => {

            async.doWhilst(
                callback => {
                    var prevOrderId = index > 0
                        ? orders[index - 1].orderId
                        : 0;

                    var order = orders[index];
                    console.log('Added order #' + order.orderId + ' after order #' + prevOrderId);
                    addOrderPromise(
                        prevOrderId,
                        order.orderId,
                        order.account,
                        order.quantity,
                        order.originalQuantity,
                        order.pricePerCoin,
                        -1,
                        { gas: 200000 }
                    )
                        .then(transactionHash => {
                            //console.log(transactionHash);
                            index++;
                            callback();
                        })
                        .catch(error => {
                            callback(error);
                        });
                },
                () => index < orders.length,
                (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(orders);
                    }
                }
            );
        });
    },

    checkOrders: function(getOrderFunction, orders) {
        var getOrderPromise = promisify(getOrderFunction);

        var index = 0;

        return new Promise((resolve, reject) => {

            async.doWhilst(
                callback => {
                    var order = orders[index];
                    console.log('Checking order [ ' + index + ' / ' + orders.length + ' ] orderId: ' + order.orderId);
                    getOrderPromise(order.orderId)
                        .then(result => {
                            var contractOrder = this.toOrderObject(result);

                            this.checkOrder(contractOrder, order);

                            index++;
                            callback();
                        })
                        .catch(error => {
                            callback(error);
                        });
                },
                () => index < orders.length,
                (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                }
            );
        });
    },

    /**
     *
     * @param web3
     * @param {String} contractAddress
     * @param {Array<*>} orders
     * @param {Number} first
     * @param {Number} size
     * @param {Number} nextOrderId
     * @returns {Promise}
     */
    confirmOrders: function(web3, contractAddress, orders, first, size, nextOrderId) {
        var contract = this._getOrdersContract(web3, contractAddress);

        return this.checkOrders(contract.get, orders)

            .then(() => console.log('Checking first'))
            .then(() => promisify(contract.first)())
            .then(contractFirst => assert.equal(contractFirst.toNumber(), first))

            .then(() => console.log('Checking size'))
            .then(() => promisify(contract.size)())
            .then(contractSize => assert.equal(contractSize.toNumber(), size))

            .then(() => console.log('Checking nextOrderId'))
            .then(() => promisify(contract.nextOrderId)())
            .then(contractNextOrderId => assert.equal(contractNextOrderId.toNumber(), nextOrderId));
    },

    /**
     *
     * @param {{eth: {defaultAccount}}} web3
     * @param {Array<*>} orders
     * @param {Number} nextOrderId
     * @param {{setNextOrderId: Function, add: Function}} toContract
     * @returns {Promise}
     */
    importOrders: function(web3, orders, nextOrderId, toContract) {
        return this.checkOwner(toContract, web3.eth.defaultAccount)
            .then(() => promisify(toContract.size)())
            .then(size => assert.equal(size.toNumber(), 0,
                'Contract must be empty before any orders can be imported. ' +
                'Instead, contract has ' + size.toNumber() + ' orders'))
            .then(() => this.addOrders(toContract.add, orders))
            .then(() => promisify(toContract.setNextOrderId)(nextOrderId));
    },

    importOrdersFromFile: function(web3, contractAddress, fileName) {
        var orders = JSON.parse(fs.readFileSync(fileName));

        var contract = this._getOrdersContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => console.log('Importing ' + orders.orders.length +
                ' orders into GxOrderList contract at ' + contractAddress))
            .then(() => this.importOrders(web3, orders.orders, orders.nextOrderId, contract));
    },

    exportOrders: function(web3, contractAddress, fileName) {
        var contract = this.getDeployedContract(web3, '../GxOrderList.sol', 'GxOrderList', contractAddress);
        return this._exportOrders(contract, fileName, this.getOrders.bind(this));
    },

    exportTraders: function(web3, contractAddress, fileName) {
        var contract = this.getDeployedContract(web3, '../GxTraders.sol', 'GxTraders', contractAddress);

        var getGXCBalance = promisify(contract.coinBalance);
        var getUSDBalance = promisify(contract.dollarBalance);
        var getETHBalance = promisify(web3.eth.getBalance);

        var buildAccountFromAddress = address => {
            return Promise.all([
                getGXCBalance(address),
                getUSDBalance(address),
                getETHBalance(address)
            ])
                .then(balances => {
                    return {
                        address: address,
                        gxc: balances[0].toNumber(),
                        usd: balances[1].toNumber(),
                        eth: web3.fromWei(balances[2], 'ether')
                    };
                });
        };

        return this.getAccounts(contract, buildAccountFromAddress).then(traders => this._exportToFile(traders, fileName));
    },

    exportAdmins: function(web3, contractAddress, fileName) {
        return this.exportAccounts(web3, contractAddress, fileName, address => address, '../GxAdmins.sol', 'GxAdmins');
    },

    exportDeploymentAdmins: function(web3, contractAddress, fileName) {
        return this.exportAccounts(web3, contractAddress, fileName, address => address, '../GxDeploymentAdmins.sol', 'GxDeploymentAdmins');
    },

    exportAccounts: function(web3, contractAddress, fileName, buildAccountFromAddress, contractSource, contractName) {
        var contract = this.getDeployedContract(web3, contractSource, contractName, contractAddress);
        return this.getAccounts(contract, buildAccountFromAddress).then(traders => this._exportToFile(traders, fileName));
    },

    /**
     *
     * @param web3
     * @param {String} address
     * @param {String} fileName
     * @returns {*}
     */
    confirmOrdersFromFile: function(web3, address, fileName) {
        var orders = JSON.parse(fs.readFileSync(fileName));
        return this.confirmOrders(web3, address, orders.orders, orders.first, orders.size, orders.nextOrderId);
    },

    exportGooseberryBuyOrders: function(web3, contractAddress, fileName) {
        var contract = this._getGooseberryOrdersContract(web3, contractAddress);
        return this._exportOrders(contract, fileName, this.getGooseberryBuyOrders.bind(this));
    },

    exportGooseberrySellOrders: function(web3, contractAddress, fileName) {
        var contract = this._getGooseberryOrdersContract(web3, contractAddress);
        return this._exportOrders(contract, fileName, this.getGooseberrySellOrders.bind(this));
    },

    addOwner: function(web3, contractAddress, ownerAddress, gas) {
       var contract = this._getOrdersContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.addOwner)(ownerAddress, {gas: gas}))
            .then(txHash => console.log('Added ' + ownerAddress + ' as owner; transactionHash = ' + txHash));
    },

    removeOwner: function(web3, contractAddress, ownerAddress, gas) {
       var contract = this._getOrdersContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.removeOwner)(ownerAddress, {gas: gas}))
            .then(txHash => console.log('Removed ' + ownerAddress + ' as owner; transactionHash = ' + txHash));
    },

    isOwner: function(web3, contractAddress, ownerAddress) {
       var contract = this._getOrdersContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => this.checkOwner(contract, ownerAddress))
            .then(() => console.log(ownerAddress + ' is owner on contract ' + contractAddress));
    },

    addDeploymentAdmin: function(web3, contractAddress, adminAddress, gas) {
        var contract = this._getAccountsContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.add)(adminAddress, {gas: gas}))
            .then(txHash => console.log('Added ' + adminAddress + ' as deployment admin; transactionHash = ' + txHash));
    },

    removeDeploymentAdmin: function(web3, contractAddress, adminAddress, gas) {
        var contract = this._getAccountsContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.remove)(adminAddress, {gas: gas}))
            .then(txHash => console.log('Removed ' + adminAddress + ' as deployment admin; transactionHash = ' + txHash));
    },

    isDeploymentAdmin: function(web3, contractAddress, address) {
        var contract = this._getAccountsContract(web3, contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.contains)(address))
            .then(result =>
                console.log('Account ' + address + ' ' +
                    (result
                        ? 'is a deployment admin'
                        : 'is not a deployment admin') +
                    ' on contract at ' + contractAddress));
    },

    upgradeDeploymentAdmins: function(web3, contractAddress, deploymentAdminsAddress) {
        var contract = this.getDeployedContract(web3, '../GxCallableByDeploymentAdmin.sol', 'GxCallableByDeploymentAdmin', contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.upgradeDeploymentAdmins)(deploymentAdminsAddress))
            .then(txHash => console.log('Upgraded deployment admins of contract ' + contractAddress + '; ' +
                'transactionHash = ' + txHash));
    },

    upgradeDeploymentAdminProvider: function(web3, contractAddress, deploymentAdminsProviderAddress) {
        var contract = this.getDeployedContract(web3, '../GxAdministered.sol', 'GxAdministered', contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.upgradeDeploymentAdminsProvider)(deploymentAdminsProviderAddress))
            .then(txHash => console.log('Upgraded deployment admins provider of contract ' + contractAddress + '; ' +
                'transactionHash = ' + txHash));
    },

    upgradeEventsContract: function(web3, contractAddress, eventsContractAddress) {
        var contract = this.getDeployedContract(web3, '../GxOrders.sol', 'GxOrders', contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.upgradeEventsContract)(eventsContractAddress))
            .then(txHash => console.log('Upgraded events contract of ' + contractAddress + '; ' +
                'transactionHash = ' + txHash));
    },

    upgradeSuperContract: function(web3, contractAddress, superContractAddress) {
        var contract = this.getDeployedContract(web3, '../GxSubContract.sol', 'GxSubContract', contractAddress);

        return Promise.resolve()
            .then(() => promisify(contract.upgradeSuperContract)(superContractAddress))
            .then(txHash => console.log('Upgraded super contract of ' + contractAddress + '; ' +
                'transactionHash = ' + txHash));
    },

    _getOrdersContract: function(web3, contractAddress) {
        return this.getDeployedContract(web3, '../GxOrderListInterface.sol', 'GxOrderListInterface', contractAddress);
    },

    _getAccountsContract: function(web3, contractAddress) {
        return this.getDeployedContract(web3, '../GxAccountsInterface.sol', 'GxAccountsInterface', contractAddress);
    },

    _getGooseberryOrdersContract: function(web3, contractAddress) {
        return this.getDeployedContract(web3, '1.5.4_gxOrders_Interface.sol', 'gxOrders', contractAddress);
    },

    /**
     *
     * @param contract
     * @param fileName
     * @param getOrdersMethod
     * @returns {Promise}
     * @private
     */
    _exportOrders: function(contract, fileName, getOrdersMethod) {
        return getOrdersMethod(contract)
            .then(result => {
                _.each(result.orders, order => {
                    console.log('Order #' + order.orderId + '; ' + order.quantity + ' @ ' + order.pricePerCoin);
                });

                // old contract uses maxId
                // new contract uses nextOrderId
                result.nextOrderId = result.maxId + 1;
                delete result.maxId;

                return result;
            })
            .then(result => this._exportToFile(result, fileName));
    },

    _exportToFile: function(result, fileName) {
        console.log('writing to ' + fileName);

        if (path.extname(fileName) === '.xlsx') {
            var xls = json2xls(result);
            fs.writeFileSync(fileName, xls, 'binary');
        } else {
            fs.writeFileSync(fileName, JSON.stringify(result, null, '  '));
        }
    }
};
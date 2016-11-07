/**
 * Tests for GXCoinOrderList contract
 * Created by leonid.gaiazov on 7/11/2016.
 */
'use strict';

const path = require('path');
const Web3 = require('web3');
const chai = require('chai');
const _ = require('underscore');
const TestRPC = require('ethereumjs-testrpc');
const promisify = require('es6-promisify');

const contractMethods = require('./../lib/contractMethods');
const testMethods = require('./../lib/testMethods');
const solcWrapper = require('./../lib/solcWrapper');

const DEFAULT_GAS = {
    ADD_ORDER: 500000,
    UPDATE_ORDER: 2000000
};

var loggerFunction = () => {
    // do nothing
};

contractMethods.log = loggerFunction;
solcWrapper.log = loggerFunction;

chai.use(require('chai-string'));

const assert = chai.assert;

var tests = function(web3) {
    var blocks = 0; // on testrpc, we have to use 0
    var contracts;
    var accounts = [];
    var unauthorizedAccount;
    var testAccount;

    before(function() {
        return promisify(web3.eth.getAccounts)().then(accts => {
            web3.eth.defaultAccount = accts[0];

            assert.equal(accts.length, 10);
            accounts = accts;
            unauthorizedAccount = accts[1];
            testAccount = accts[2];
        });
    });

    describe('contract source code', function() {
        this.timeout(0);
        it('should compile', function() {
            let optimize = 1;
            var fileNames = [
                'GxOrderList.sol',
                'GxDeploymentAdmins.sol'
            ];

            let solcOutput = solcWrapper.compile(fileNames, optimize, path.join(__dirname, '..'));

            if (solcOutput.errors) {
                console.log('Compilation errors! See below:');
                _.each(solcOutput.errors, error => {
                    console.log(error);
                });
            }

            assert.isNotOk(solcOutput.errors, 'there should be no compilation errors');

            console.log('Continuing with unit tests ...');

            contracts = {
                GxDeploymentAdmins: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, 'GxDeploymentAdmins'),
                GxOrderList: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, 'GxOrderList'),

                IterableAddressMapping: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, 'IterableAddressMapping'),
                IterableAddressBalanceMapping: solcWrapper.buildContractFromSolcOutput(web3, solcOutput, 'IterableAddressBalanceMapping')
            };
        });
    });

    describe('contract deployment', function() {
        var libraries = [];

        it('should deploy and verify the IterableAddressMapping contract', function() {
            return contractMethods.deployLibrary(web3, contracts.IterableAddressMapping, {libraries, blocks})
                .then(contract => {
                    libraries.push({
                        name: contract.name,
                        address: contract.address
                    });
                });
        });

        it('should deploy and verify the IterableAddressBalanceMapping contracts', function() {
            return contractMethods.deployLibrary(web3, contracts.IterableAddressBalanceMapping, {libraries, blocks})
                .then(contract => {
                    libraries.push({
                        name: contract.name,
                        address: contract.address
                    });
                });
        });

        it('should deploy GxDeploymentAdmins contract', function() {
            return contractMethods.deployContract(
                web3,
                contracts.GxDeploymentAdmins,
                [],
                {libraries}
            )
                .then(() => contractMethods.confirmContract(web3, contracts.GxDeploymentAdmins, {blocks}))
                .then(() => contracts.GxDeploymentAdmins.promised.contains(web3.eth.defaultAccount))
                .then(result => assert.isTrue(result, 'default account should be a deployment admin'));
        });

        it('should deploy GxOrderList contract', function() {
            return contractMethods.deployContract(
                web3,
                contracts.GxOrderList,
                [contracts.GxDeploymentAdmins.address],
                {libraries, blocks}
            )
                .then(() => contractMethods.confirmContract(web3, contracts.GxOrderList, {blocks}))
                .then(contract => {
                    // helpers which don't exist on the contract but make life easier
                    contract.promised.addOrder = (previousOrderId, order, transactionParams) => {

                        let _transactionParams = !_.isUndefined(transactionParams) ? transactionParams : {gas: DEFAULT_GAS.ADD_ORDER};
                        _transactionParams.gas = !_.isUndefined(_transactionParams.gas) ? _transactionParams.gas : DEFAULT_GAS.ADD_ORDER;

                        contract.promised.add(
                            previousOrderId,
                            order.orderId,
                            order.account,
                            order.quantity,
                            order.originalQuantity,
                            order.pricePerCoin,
                            order.expirationTime,
                            _transactionParams);
                    };

                    contract.promised.updateOrder = (order, transactionParams) => {

                        let _transactionParams = !_.isUndefined(transactionParams) ? transactionParams : {gas: DEFAULT_GAS.UPDATE_ORDER};
                        _transactionParams.gas = !_.isUndefined(_transactionParams.gas) ? _transactionParams.gas : DEFAULT_GAS.UPDATE_ORDER;

                        contract.promised.update(
                            order.orderId,
                            order.account,
                            order.quantity,
                            order.originalQuantity,
                            order.pricePerCoin,
                            order.expirationTime,
                            _transactionParams);
                    };
                })
                .then(() => contracts.GxOrderList.promised.deploymentAdmins())
                .then(deploymentAdminsAddress => assert.equal(deploymentAdminsAddress, contracts.GxDeploymentAdmins.address,
                    'OrderList contract should have "' + contracts.GxDeploymentAdmins.address + '" as deployment admins contract'));
        });

        it('should add defaultAccount to list of owner contracts', function() {
            return Promise.resolve()
                .then(() => contracts.GxOrderList.promised.addOwner(web3.eth.defaultAccount))
                .then(() => contracts.GxOrderList.promised.isOwner(web3.eth.defaultAccount))
                .then(isOwner => assert.isTrue(isOwner,
                    'default account should be able to add itself as owner'));
        });
    });

    describe('check order contract functions for existence', function() {
        var contract;

        before('local variables', function() {
            contract = contracts.GxOrderList.contract;
        });

        it('should have addAfter method', function() {
            assert.isFunction(contract.add, 'addAfter must be a function');
        });

        it('should have get method', function() {
            assert.isFunction(contract.get, 'get must be a function');
        });

        it('should have update method', function() {
            assert.isFunction(contract.update, 'update must be a function');
        });

        it('should have remove method', function() {
            assert.isFunction(contract.remove, 'remove must be a function');
        });

        it('should have move method', function() {
            assert.isFunction(contract.move, 'move must be a function');
        });

        it('should have size method', function() {
            assert.isFunction(contract.size, 'size must be a function');
        });

        it('should have last method', function() {
            assert.isFunction(contract.last, 'last must be a function');
        });

        it('should have first method', function() {
            assert.isFunction(contract.first, 'first must be a function');
        });

        it('should have nextOrderId method', function() {
            assert.isFunction(contract.nextOrderId, 'nextOrderId must be a function');
        });
    });

    describe('empty order contract tests', function() {
        var initialSnapshotId;
        var promiseContract;

        // before any tests, confirm that the order contract is empty
        // and save the snapshot id
        before(() => {
            promiseContract = contracts.GxOrderList.promised;

            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0, 'there should not be any orders'))
                .then(() => testMethods.getSnapshotId(web3))
                .then(snapshotId => {
                    initialSnapshotId = snapshotId;
                });
        });

        // before each test, assert that there are no orders
        beforeEach(() => {
            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0, 'there should not be any orders'));
        });

        // after each test, revert the snapshot and assert that it was successfully reverted
        afterEach(() => {
            return testMethods.revertToSnapshot(web3, initialSnapshotId)
                .then(() => testMethods.getSnapshotId(web3))
                .then(snapshotId => assert.equal(initialSnapshotId, snapshotId,
                    'EVM snapshot should have been reset to initial snapshot'));
        });

        it('should add a single order to an empty contract', function() {
            let order = {
                orderId: 1,
                account: '0xCDDDDDDDAAA52454254252452400000000000030',
                quantity: 10,
                originalQuantity: 20,
                pricePerCoin: 100,
                expirationTime: 1500000000
            };

            // 1. add the order
            return Promise.resolve()
                // add new order
                .then(() => promiseContract.addOrder(0, order))

                // confirm order was added
                .then(() => promiseContract.get(order.orderId))
                .then(result => {
                    let insertedOrder = toOrderObject(result);

                    assertOrdersEqual(insertedOrder, order);
                    assert.equal(insertedOrder.next, 0);
                    assert.equal(insertedOrder.previous, 0);
                })

                // check size
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 1, 'there should be only 1 order'))

                // confirm nextOrderId() is correct
                .then(() => promiseContract.nextOrderId())
                .then(nextOrderId => assert.equal(nextOrderId.toNumber(), order.orderId + 1,
                    'the next order id should be orderId + 1'));
        });

        it('should add two orders to an empty contract', function() {
            let firstOrder = {
                account: '0xFFFAEEEF52452454254252452400000000000030',
                quantity: 1,
                originalQuantity: 5,
                pricePerCoin: 15,
                expirationTime: 1511111111
            };

            let secondOrder = {
                account: '0xC131313131352454254252452400000000000030',
                quantity: 20,
                originalQuantity: 20,
                pricePerCoin: 100,
                expirationTime: 1522222222
            };

            return Promise.resolve()

                // get the next order id and put it in firstOrder
                .then(() => promiseContract.nextOrderId())
                .then(orderId => {
                    // save the order id (to compare later)
                    firstOrder.orderId = orderId.toNumber();
                })

                // insert order
                .then(() => promiseContract.addOrder(0, firstOrder))

                // confirm inserted order
                .then(() => promiseContract.get(firstOrder.orderId))
                .then(orderArray => {
                    let firstContractOrder = toOrderObject(orderArray);

                    assertOrdersEqual(firstContractOrder, firstOrder);
                    assert.equal(firstContractOrder.next, 0);
                    assert.equal(firstContractOrder.previous, 0);
                })

                // check size
                .then(() => promiseContract.size())
                .then(size => {
                    // check that the size was correctly set
                    assert.equal(size.toNumber(), 1, 'there should be only 1 order');
                })

                // confirm nextOrderId was increment and store it in secondOrder
                .then(() => promiseContract.nextOrderId())
                .then(nextOrderId => {
                    // check that the next order id was increment
                    assert.equal(nextOrderId.toNumber(), firstOrder.orderId + 1,
                        'the next order id should be firstOrder.orderId + 1');

                    // save the next order id
                    secondOrder.orderId = nextOrderId.toNumber();
                })

                // insert the second order after the first order
                .then(() => promiseContract.addOrder(firstOrder.orderId, secondOrder))

                // confirm that the inserted order is same as the one we sent
                .then(() => promiseContract.get(secondOrder.orderId))
                .then(orderArray => {
                    let secondContractOrder = toOrderObject(orderArray);

                    assertOrdersEqual(secondContractOrder, secondOrder);
                    assert.equal(secondContractOrder.next, 0);
                    assert.equal(secondContractOrder.previous, firstOrder.orderId);
                })

                // get the firstOrder from contract again
                // and confirm that firstOrder.next now points to secondOrder
                .then(() => promiseContract.get(firstOrder.orderId))
                .then(order => assert.equal(toOrderObject(order).next, secondOrder.orderId))

                // check that the size was correctly set
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 2, 'there should be two orders'))

                // check that the next order id was increment
                .then(() => promiseContract.nextOrderId())
                .then(nextOrderId => {
                    assert.equal(nextOrderId.toNumber(), secondOrder.orderId + 1,
                        'the next order id should be secondOrder.orderId + 1');
                });
        });
    });

    describe('tests with existing orders', function() {
        var initialSnapshotId;
        var fourOrdersSnapshotId;
        var promiseContract;

        var order1 = {
            orderId: 1,
            account: '0xAAAA723752546464848484464646467688986967',
            quantity: 10,
            originalQuantity: 5,
            pricePerCoin: 57,
            expirationTime: 1514892615
        };

        var order2 = {
            orderId: 2,
            account: '0xBBB2464626743768978654565636365365363563',
            quantity: 1535,
            originalQuantity: 1535,
            pricePerCoin: 46,
            expirationTime: 1517878111
        };

        var order3 = {
            orderId: 3,
            account: '0xCCC0254252452454254252452400000000000030',
            quantity: 431,
            originalQuantity: 2554,
            pricePerCoin: 65,
            expirationTime: 1510654111
        };

        var order4 = {
            orderId: 4,
            account: '0xDDD2355252524545245425425245000000000030',
            quantity: 48,
            originalQuantity: 75,
            pricePerCoin: 789,
            expirationTime: 1546789765
        };

        var nullOrder = {
            orderId: 0,
            next: 0,
            previous: 0,
            account: '0x0000000000000000000000000000000000000000',
            quantity: 0,
            originalQuantity: 0,
            pricePerCoin: 0,
            expirationTime: 0
        };

        // before any tests,
        // 1. confirm that the order contract is empty
        // 2. insert 4 orders
        // 3. save the snapshot id
        before(() => {
            promiseContract = contracts.GxOrderList.promised;

            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => {
                    assert.equal(size.toNumber(), 0, 'there should not be any orders');
                })
                .then(() => testMethods.getSnapshotId(web3))
                .then(snapshotId => {
                    initialSnapshotId = snapshotId;
                })
                // add orders
                // add orders are added in a specific order that hits every insert scenario
                .then(() => promiseContract.addOrder(0, order2))              // [2]          insert into empty
                .then(() => promiseContract.addOrder(0, order1))              // [1, 2]       insert at front
                .then(() => promiseContract.addOrder(order2.orderId, order4)) // [1, 2, 4]    insert at end
                .then(() => promiseContract.addOrder(order2.orderId, order3)) // [1, 2, 3, 4] insert in the middle
                .then(() => promiseContract.size())
                .then(size => {
                    assert.equal(size.toNumber(), 4, 'there should be 4 orders');
                })
                .then(() => Promise.all([
                    promiseContract.get(order1.orderId),
                    promiseContract.get(order2.orderId),
                    promiseContract.get(order3.orderId),
                    promiseContract.get(order4.orderId)
                ]))
                .then(contractOrders => {
                    let contractOrder1 = toOrderObject(contractOrders[0]);
                    let contractOrder2 = toOrderObject(contractOrders[1]);
                    let contractOrder3 = toOrderObject(contractOrders[2]);
                    let contractOrder4 = toOrderObject(contractOrders[3]);

                    assertOrdersEqual(order1, contractOrder1);
                    assertOrdersEqual(order2, contractOrder2);
                    assertOrdersEqual(order3, contractOrder3);
                    assertOrdersEqual(order4, contractOrder4);

                    assert.equal(contractOrder1.previous, 0, 'previous of 1st order should be 0 because it is the first order');
                    assert.equal(contractOrder2.previous, order1.orderId, 'previous of 2nd order should be 1');
                    assert.equal(contractOrder3.previous, order2.orderId, 'previous of 3rd order should be 2');
                    assert.equal(contractOrder4.previous, order3.orderId, 'previous of 4th order should be 3');

                    assert.equal(contractOrder1.next, order2.orderId, 'next of 1st order should be 2');
                    assert.equal(contractOrder2.next, order3.orderId, 'next of 2nd order should be 3');
                    assert.equal(contractOrder3.next, order4.orderId, 'next of 3rd order should be 4');
                    assert.equal(contractOrder4.next, 0, 'next of 4th order should be 0 because it is the last order');
                })
                .then(() => testMethods.getSnapshotId(web3))
                .then(snapshotId => {
                    fourOrdersSnapshotId = snapshotId;
                });
        });

        // before each test, assert that there are no orders
        beforeEach(() => {
            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 4, 'there should be 4 orders'));
        });

        // after each test, revert the snapshot and assert that it was successfully reverted
        afterEach(() => {
            return testMethods.revertToSnapshot(web3, fourOrdersSnapshotId)
                .then(() => {
                    return testMethods.getSnapshotId(web3);
                })
                .then(snapshotId => {
                    assert.equal(fourOrdersSnapshotId, snapshotId, 'EVM snapshot should have been reset to four-order snapshot');
                });
        });

        // after all tests, revert snapshot to initial state
        after(() => {
            return testMethods.revertToSnapshot(web3, initialSnapshotId)
                .then(() => {
                    return testMethods.getSnapshotId(web3);
                })
                .then(snapshotId => {
                    assert.equal(initialSnapshotId, snapshotId, 'EVM snapshot should have been reset to initial snapshot');
                });
        });

        it('should have 4 orders', function() {
            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 4, 'there should be 4 orders'));
        });

        it('should remove first order', function() {
            return Promise.resolve()
                .then(() => promiseContract.remove(order1.orderId))
                .then(() => promiseContract.size())
                .then(size => {
                    assert.equal(size.toNumber(), 3, 'there should be 3 orders left after one order is removed');
                })
                .then(() => promiseContract.get(order1.orderId))
                .then(order => {
                    let contractOrder1 = toOrderObject(order);
                    // confirm that the order was deleted
                    // we should get an empty order if it was deleted correctly
                    assertOrdersEqual(contractOrder1, nullOrder);

                    // get the second order
                    return promiseContract.get(order2.orderId);
                })
                .then(order => {
                    let contractOrder2 = toOrderObject(order);
                    assertOrdersEqual(contractOrder2, order2);

                    assert.equal(contractOrder2.next, order3.orderId);
                    assert.equal(contractOrder2.previous, 0,
                        'since order1 was removed, order2 is now the first order and should have "previous" equal to 0');
                });
        });

        it('should remove last order', function() {
            return Promise.resolve()
                .then(() => promiseContract.remove(order4.orderId))
                .then(() => promiseContract.size())
                .then(size => {
                    assert.equal(size.toNumber(), 3, 'there should be 3 orders left after one order is removed');
                })
                // get the order we just deleted and confirm it was deleted
                .then(() => promiseContract.get(order4.orderId))
                .then(order => {
                    let contractOrder1 = toOrderObject(order);
                    // confirm that the order was deleted
                    // we should have an empty order if it was deleted correctly
                    assertOrdersEqual(contractOrder1, nullOrder);
                })
                // get the 3rd order which should now be last
                .then(() => promiseContract.get(order3.orderId))
                .then(order => {
                    let contractOrder3 = toOrderObject(order);
                    assertOrdersEqual(contractOrder3, order3);

                    assert.equal(contractOrder3.next, 0,
                        'since order4 was removed, order3 is now the last order and should have "next" equal to 0');
                    assert.equal(contractOrder3.previous, order2.orderId);
                });
        });

        it('should remove middle order', function() {
            return Promise.resolve()
                .then(() => promiseContract.remove(order2.orderId))

                // confirm size decrease
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 3,
                    'there should be 3 orders left after one order is removed'))

                // get the order we just deleted and confirm it was deleted
                .then(() => promiseContract.get(order2.orderId))
                .then(order => assertOrdersEqual(toOrderObject(order), nullOrder))

                // get the 1st order to check that it's 'next' now points to 3rd order
                .then(() => promiseContract.get(order1.orderId))
                .then(order => {
                    let contractOrder1 = toOrderObject(order);
                    assertOrdersEqual(contractOrder1, order1);

                    assert.equal(contractOrder1.previous, 0);
                    assert.equal(contractOrder1.next, order3.orderId,
                        'the first order should have order3 as "next" because order2 was removed');
                })

                // check that 3rd order 'previous' now points to 1st order, since 2nd order was removed
                .then(() => promiseContract.get(order3.orderId))
                .then(order => {
                    let contractOrder3 = toOrderObject(order);
                    assertOrdersEqual(contractOrder3, order3);

                    assert.equal(contractOrder3.previous, order1.orderId);
                });
        });

        it('should remove all orders', function() {
            return Promise.resolve()

                // remove middle order
                .then(() => promiseContract.remove(order2.orderId))

                // confirm size decrease
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 3,
                    'there should be 3 orders left after one order is removed'))

                // get the order we just deleted and confirm it was deleted
                .then(() => promiseContract.get(order2.orderId))
                .then(order => assertOrdersEqual(toOrderObject(order), nullOrder))

                // delete last order
                .then(() => promiseContract.remove(order4.orderId))

                // get the order we just deleted and confirm it was deleted
                .then(() => promiseContract.get(order4.orderId))
                .then(order => assertOrdersEqual(toOrderObject(order), nullOrder))

                // confirm the last() property changed
                .then(() => promiseContract.last())
                .then(last => assert.equal(last.toNumber(), order3.orderId))

                // confirm size decrease
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 2,
                    'there should be 2 orders left after two orders are removed'))

                // check first() points to order1
                .then(() => promiseContract.first())
                .then(first => assert.equal(first, order1.orderId))

                // check last() points to order3, since order4 was removed
                .then(() => promiseContract.last())
                .then(last => assert.equal(last, order3.orderId))

                // check that order1 has correct links for first order
                .then(() => promiseContract.get(order1.orderId))
                .then(order => {
                    let contractOrder1 = toOrderObject(order);
                    assertOrdersEqual(contractOrder1, order1);
                    assert.equal(contractOrder1.previous, 0);
                    assert.equal(contractOrder1.next, order3.orderId);
                })

                // check that order3 has correct links for last order
                .then(() => promiseContract.get(order3.orderId))
                .then(order => {
                    let contractOrder3 = toOrderObject(order);
                    assertOrdersEqual(contractOrder3, order3);
                    assert.equal(contractOrder3.previous, order1.orderId);
                    assert.equal(contractOrder3.next, 0);
                })

                // delete first order
                .then(() => promiseContract.remove(order1.orderId))

                // get the order we just deleted and confirm it was deleted
                .then(() => promiseContract.get(order1.orderId))
                .then(order => assertOrdersEqual(toOrderObject(order), nullOrder))

                // confirm size change
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 1,
                    'there should be 1 orders left after 3 orders are removed'))

                // get the remaining order to check the next/previous links
                .then(() => promiseContract.get(order3.orderId))
                .then(order => {
                    let contractOrder3 = toOrderObject(order);
                    assertOrdersEqual(contractOrder3, order3);

                    assert.equal(contractOrder3.next, 0);
                    assert.equal(contractOrder3.next, 0);
                })

                // check first() is order3
                .then(() => promiseContract.first())
                .then(first => assert.equal(first, order3.orderId))

                // check last() is also order3
                .then(() => promiseContract.last())
                .then(last => assert.equal(last, order3.orderId))

                // delete remaining order
                .then(() => promiseContract.remove(order3.orderId))

                // get the order we just deleted and confirm it was deleted
                .then(() => promiseContract.get(order3.orderId))
                .then(order => assertOrdersEqual(toOrderObject(order), nullOrder))

                // confirm size is now 0
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0,
                    'there should be 1 orders left after 3 orders are removed'))

                // check first() is 0
                .then(() => promiseContract.first())
                .then(first => assert.equal(first, 0))

                // check last() is 0
                .then(() => promiseContract.last())
                .then(last => assert.equal(last, 0));
        });

        it('should update existing order', function() {
            let newOrder1 = _.extend(_.clone(order1), {
                quantity: 999999
            });

            return Promise.resolve()
                .then(() => promiseContract.updateOrder(newOrder1))
                .then(() => promiseContract.get(newOrder1.orderId))
                .then(order => assertOrdersEqual(toOrderObject(order), newOrder1));
        });

        it('should move order from last to first', function() {
            // we start off with [1, 2, 3, 4]
            // after moving 4 to the front, we will have
            // [4, 1, 2, 3]
            return Promise.resolve()
                // check that order1 is first
                .then(() => promiseContract.first())
                .then(first => assert.equal(first, order1.orderId))

                // check that order4 is last
                .then(() => promiseContract.last())
                .then(last => assert.equal(last, order4.orderId))

                // move order4 to first
                .then(() => promiseContract.move(order4.orderId, 0))

                // confirm order4 is now first
                .then(() => promiseContract.first())
                .then(first => assert.equal(first, order4.orderId))

                // confirm order3 is now last
                .then(() => promiseContract.last())
                .then(last => assert.equal(last, order3.orderId))

                // confirm all the next/previous links
                .then(() => Promise.all([
                    promiseContract.get(order1.orderId),
                    promiseContract.get(order2.orderId),
                    promiseContract.get(order3.orderId),
                    promiseContract.get(order4.orderId)
                ]))
                .then(contractOrders => {
                    let contractOrder1 = toOrderObject(contractOrders[0]);
                    let contractOrder2 = toOrderObject(contractOrders[1]);
                    let contractOrder3 = toOrderObject(contractOrders[2]);
                    let contractOrder4 = toOrderObject(contractOrders[3]);

                    assertOrdersEqual(order1, contractOrder1);
                    assertOrdersEqual(order2, contractOrder2);
                    assertOrdersEqual(order3, contractOrder3);
                    assertOrdersEqual(order4, contractOrder4);

                    // confirm the order is now [4, 1, 2, 3]
                    assert.equal(contractOrder4.previous, 0, 'previous of 4th order should now be 0 because it was moved to the front');
                    assert.equal(contractOrder1.previous, order4.orderId, 'previous of 1st order should be 4 because 4 was moved to the front');
                    assert.equal(contractOrder2.previous, order1.orderId, 'previous of 2nd order should be 1');
                    assert.equal(contractOrder3.previous, order2.orderId, 'previous of 3rd order should be 2');

                    assert.equal(contractOrder4.next, order1.orderId, 'next of 4th order should be 1 because we moved it to the front');
                    assert.equal(contractOrder1.next, order2.orderId, 'next of 1st order should be 2');
                    assert.equal(contractOrder2.next, order3.orderId, 'next of 2nd order should be 3');
                    assert.equal(contractOrder3.next, 0, 'next of 3rd order should be 0 because 4 was moved to the front');
                });
        });

        it('swap order 2 and 3', function() {
            // we start off with [1, 2, 3, 4]
            // after moving 3 to be after 1 we have
            // [1, 3, 2, 4]
            return Promise.resolve()
                // move order3 to be after 1
                .then(() => promiseContract.move(order3.orderId, order1.orderId))

                // confirm order1 is still first
                .then(() => promiseContract.first())
                .then(first => assert.equal(first, order1.orderId))

                // confirm order4 is still last
                .then(() => promiseContract.last())
                .then(last => assert.equal(last, order4.orderId))

                // confirm all the next/previous links
                .then(() => Promise.all([
                    promiseContract.get(order1.orderId),
                    promiseContract.get(order2.orderId),
                    promiseContract.get(order3.orderId),
                    promiseContract.get(order4.orderId)
                ]))
                .then(contractOrders => {
                    let contractOrder1 = toOrderObject(contractOrders[0]);
                    let contractOrder2 = toOrderObject(contractOrders[1]);
                    let contractOrder3 = toOrderObject(contractOrders[2]);
                    let contractOrder4 = toOrderObject(contractOrders[3]);

                    assertOrdersEqual(order1, contractOrder1);
                    assertOrdersEqual(order2, contractOrder2);
                    assertOrdersEqual(order3, contractOrder3);
                    assertOrdersEqual(order4, contractOrder4);

                    // confirm the order is now [1, 3, 2, 4]
                    assert.equal(contractOrder1.previous, 0, 'previous of 1st order should be 0 because it is the first order');
                    assert.equal(contractOrder3.previous, order1.orderId, 'previous of 3rd order should now be 1');
                    assert.equal(contractOrder2.previous, order3.orderId, 'previous of 2nd order should now be 3');
                    assert.equal(contractOrder4.previous, order2.orderId, 'previous of 4th order should now be 3');

                    assert.equal(contractOrder1.next, order3.orderId, 'next of 1st order should now be 3');
                    assert.equal(contractOrder3.next, order2.orderId, 'next of 3nd order should now be 2');
                    assert.equal(contractOrder2.next, order4.orderId, 'next of 2rd order should now be 4');
                    assert.equal(contractOrder4.next, 0, 'next of 4th order should be 0 because it is the last order');
                });
        });
    });

    describe('permissions tests', function() {
        var initialSnapshotId;
        var promiseContract;

        let order = {
            orderId: 1,
            account: '0xCDDDDDDDAAA52454254252452400000000000030',
            quantity: 10,
            originalQuantity: 20,
            pricePerCoin: 100,
            expirationTime: 1500000000
        };

        var nullOrder = {
            orderId: 0,
            next: 0,
            previous: 0,
            account: '0x0000000000000000000000000000000000000000',
            quantity: 0,
            originalQuantity: 0,
            pricePerCoin: 0,
            expirationTime: 0
        };

        // before any tests, confirm that the order contract is empty
        // and save the snapshot id
        before(() => {
            promiseContract = contracts.GxOrderList.promised;

            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0, 'there should not be any orders'))
                .then(() => testMethods.getSnapshotId(web3))
                .then(snapshotId => {
                    initialSnapshotId = snapshotId;
                });
        });

        // before each test, assert that there are no orders
        beforeEach(() => {
            return Promise.resolve()
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0, 'there should not be any orders'));
        });

        // after each test, revert the snapshot and assert that it was successfully reverted
        afterEach(() => {
            return testMethods.revertToSnapshot(web3, initialSnapshotId)
                .then(() => testMethods.getSnapshotId(web3))
                .then(snapshotId => assert.equal(initialSnapshotId, snapshotId,
                    'EVM snapshot should have been reset to initial snapshot'));
        });

        it('should not allow add with unauthorized account', function() {
            return Promise.resolve()
                // add new order with unauthorized account
                .then(() => promiseContract.addOrder(0, order, { from: unauthorizedAccount }))

                // confirm size is still 0
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0,
                    'no orders should have been added'))

                // confirm order was *not* added
                .then(() => promiseContract.get(order.orderId))
                .then(result => {
                    let insertedOrder = toOrderObject(result);

                    assertOrdersEqual(insertedOrder, nullOrder);
                    assert.equal(insertedOrder.next, 0);
                    assert.equal(insertedOrder.previous, 0);
                });
        });

        it('should allow after adding authorized account', function() {
            return Promise.resolve()
                // add new order with unauthorized test account
                .then(() => promiseContract.addOrder(0, order, { from: testAccount }))

                // confirm size is still 0
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 0,
                    'no orders should have been added'))

                // confirm order was *not* added
                .then(() => promiseContract.get(order.orderId))
                .then(result => {
                    let insertedOrder = toOrderObject(result);

                    assertOrdersEqual(insertedOrder, nullOrder);
                    assert.equal(insertedOrder.next, 0);
                    assert.equal(insertedOrder.previous, 0);
                })

                // authorize account
                .then(() => promiseContract.addOwner(testAccount))
                .then(() => promiseContract.isOwner(testAccount))
                .then(isAuthorized => assert.isTrue(isAuthorized,
                    'default account should be able to add another authorized account'))

                // add new order with test account
                .then(() => promiseContract.addOrder(0, order, { from: testAccount }))

                // confirm size is now 1
                .then(() => promiseContract.size())
                .then(size => assert.equal(size.toNumber(), 1, 'order should have been added since account was authorized'))

                // confirm order was *not* added
                .then(() => promiseContract.get(order.orderId))
                .then(result => {
                    let insertedOrder = toOrderObject(result);

                    assertOrdersEqual(insertedOrder, order);
                    assert.equal(insertedOrder.next, 0);
                    assert.equal(insertedOrder.previous, 0);
                });
        });
    });
};

function assertOrdersEqual(orderA, orderB) {
    assert.equal(orderB.orderId, orderA.orderId, 'Orders should have same orderId');
    assert.equalIgnoreCase(orderB.account, orderA.account, 'Orders should have same account');
    assert.equal(orderB.quantity, orderA.quantity, 'Orders should have same quantity');
    assert.equal(orderB.pricePerCoin, orderA.pricePerCoin, 'Orders should have same pricePerCoin');
    assert.equal(orderB.expirationTime, orderA.expirationTime, 'Orders should have same expirationTime');
    assert.equal(orderB.originalQuantity, orderA.originalQuantity, 'Orders should have same originalQuantity');

    if (orderA.next && orderB.next) {
        assert.equal(orderA.next, orderB.next);
    }

    if (orderA.previous && orderB.previous) {
        assert.equal(orderA.previous, orderB.previous);
    }
}

function toOrderObject(orderResult) {
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
}

describe('Provider:', function() {
    var web3 = new Web3();
    // TestRPC allows for passing gasLimit as an option.  For example:
    //  web3.setProvider(TestRPC.provider(logger, {gasLimit: 500000000}));
    // However, this requires TestRPC 2.0.9.  TestRPC v2.0.7+ will default
    // to Homestead gas limit, prior versions will default to Frontier gas limit
    //
    // Newer versions of TestRPC (including 2.0.7) require NodeJS 5.x+
    web3.setProvider(TestRPC.provider(testMethods.logger));

    tests(web3);
});
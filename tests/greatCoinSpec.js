/* global describe, it */
/**
 * Tests for GxCoin contract
 * Created by derek.tiffany on 2/14/16.
 */
'use strict';

const path = require('path');
const Web3 = require('web3');
const chai = require('chai');
const _ = require('underscore');
const TestRPC = require('ethereumjs-testrpc');
const promisify = require('es6-promisify');

const transactionMethods = require('./../lib/transactionMethods');
const platformDeployment = require('./../lib/platformDeployment');

const DEFAULT_GAS = {
    ADJUST_COINS: 150000, // increased from 100k to 150k
    CANCEL_ORDER: 200000,
    CANCEL_ORDER_BY_ADMIN: 200000,
    CREATE_BUY_ORDER: 900000,
    CREATE_SELL_ORDER: 900000,
    CREATE_ORDER: 900000,
    DEFAULT: 900000,
    FUND: 100000,
    REGISTER_TRADER_ACCOUNT: 200000,
    SEED_COINS: 150000, // increased from 100k to 150k
    SET_TRADING_OPEN: 50000,
    TRANSFER_TRADER_BALANCE: 900000,
    UNREGISTER_TRADER_ACCOUNT: 200000, // increased from 100k to 200k
    WITHDRAW: 100000
};

transactionMethods.log = () => {
    // do nothing
};

chai.use(require('chai-string'));

const assert = chai.assert;

function assertNeverGetsCalled() {
    assert.isTrue(false, 'this should not be called');
}

function assertSolidityException(error) {
    assert.match(error.message, /invalid JUMP/);
}

var tests = function(web3) {
    // contract collection
    var contracts;

    var accounts;
    var primaryAddress;
    var traderAddress;

    // constants
    const blocksToConfirm = 0;

    before(function() {
        this.timeout(0);
        return Promise.resolve()
            .then(() => promisify(web3.eth.getAccounts)())
            .then(ethAccounts => {
                accounts = ethAccounts;
                primaryAddress = ethAccounts[0];
                traderAddress = ethAccounts[2];

                web3.eth.defaultAccount = primaryAddress;
            })
            .then(() => platformDeployment.deployAllContracts(web3, primaryAddress, {blocks: blocksToConfirm}))
            .then(deployedContracts => {
                contracts = deployedContracts;
            });
    });

    const basicAmount = 100;
    const MILLION = 1000000;

    describe('GxDeploymentAdmins', function() {
        var deploymentAdmins;

        before('setup variables', function() {
            deploymentAdmins = contracts.GxDeploymentAdmins.promised;
        });

        it('should add the deploying address to deployment admin collection', () =>
            deploymentAdmins.contains(accounts[0])
                .then(result => assert.equal(true, result)));

        it('should allow deployment admins to add other deployment admins', () =>
            deploymentAdmins.add(accounts[1], { from: accounts[0] })
                .then(() => deploymentAdmins.contains(accounts[1]))
                .then(result => assert.equal(true, result)));

        it('should allow deployment admins to remove other deployment admins', () =>
            deploymentAdmins.remove(accounts[1], { from: accounts[0] })
                .then(() => deploymentAdmins.contains(accounts[1]))
                .then(result => assert.equal(false, result)));

        it('should not allow deployment admins to remove themselves', () =>
            deploymentAdmins.remove(accounts[0], { from: accounts[0] })
                .then(() => deploymentAdmins.contains(accounts[0]))
                .then(result => assert.equal(true, result)));

        it('should not allow non-deployment admins to add deployment admins', () =>
            deploymentAdmins.add(accounts[3], { from: accounts[2] })
                .then(() => assertNeverGetsCalled())
                .catch(error => assertSolidityException(error))
                .then(() => deploymentAdmins.contains(accounts[3]))
                .then(result => assert.equal(false, result)));
    });

    describe('GxAdmins', function() {
        var admins;

        before('setup variables', function() {
            admins = contracts.GxAdmins.promised;
        });

        it('should allow deployment admins to add contract admins', () =>
            Promise.resolve()
                .then(() => admins.add(accounts[0], { from: accounts[0], gas: DEFAULT_GAS.DEFAULT }))
                .then(() => admins.contains(accounts[0]))
                .then(result => assert.equal(true, result))

                .then(() => admins.add(accounts[1], { from: accounts[0], gas: DEFAULT_GAS.DEFAULT }))
                .then(() => admins.contains(accounts[1]))
                .then(result => assert.equal(true, result)));

        it('should not allow non-deployment admins to add contract admins', () =>
            admins.add(accounts[3], { from: accounts[4] })
                .then(() => assertNeverGetsCalled())
                .catch(error => assertSolidityException(error))
                .then(() => admins.contains(accounts[3]))
                .then(result => assert.equal(false, result, 'non-deployment admin can\'t add contract admins')));

        it('should not allow contract admins to remove themselves', () =>
            admins.remove(accounts[1], { from: accounts[1] })
                .then(() => admins.contains(accounts[1]))
                .then(result => assert.equal(true, result)));

        it('should allow deployment admins to remove contract admins', () =>
            Promise.resolve()
                .then(() => admins.add(accounts[1], { from: accounts[0] }))
                .then(() => admins.contains(accounts[1]))
                .then(result => assert.equal(true, result))

                .then(() => admins.remove(accounts[1], { from: accounts[0] }))
                .then(() => admins.contains(accounts[1]))
                .then(result => assert.equal(false, result)));
    });

    describe('GxCoin contract', function() {
        var greatCoinPromise;
        var gxOrdersPromise;
        var gxCancelOrders;
        var tradersPromise;
        var gxBuyOrders;
        var gxSellOrders;
        var gxCoinTotalsPromise;
        var gxAdminOperationsPromise;

        /**
         *
         * @param id
         * @param quantity
         * @param pricePerCoin
         * @param userAddress
         * @param [nextId]
         * @param [gas]
         * @constructor
         */
        var Order = function(id, quantity, pricePerCoin, userAddress, nextId, gas) {
            this.orderId = id;
            this.quantity = quantity;
            this.pricePerCoin = pricePerCoin;
            this.userAddress = userAddress;
            this.nextId = typeof nextId !== 'undefined' ? nextId : 0;
            // if gas is not provided, we use 1 million gas
            this.gas = typeof gas !== 'undefined' ? gas : DEFAULT_GAS.CREATE_ORDER;
        };

        Order.prototype.createBuyOrderPromise = function() {
            return gxOrdersPromise.createOrder(this.quantity, this.pricePerCoin, 0, true, {
                from: this.userAddress,
                gas: this.gas
            });
        };

        Order.prototype.createSellOrderPromise = function() {
            return gxOrdersPromise.createOrder(this.quantity, this.pricePerCoin, 0, false, {
                from: this.userAddress,
                gas: this.gas
            });
        };

        function assertCoinLimit(expectedAmount) {
            return Promise.resolve()
                .then(() => gxCoinTotalsPromise.coinLimit())
                .then(result => assert.equal(result.toNumber(), expectedAmount));
        }

        function createOrders(orders, isBuyOrder) {
            let promises = _.map(orders, order => isBuyOrder
                ? order.createBuyOrderPromise()
                : order.createSellOrderPromise());

            return Promise.all(promises);
        }

        function verifyOrders(orderList, orders) {
            return Promise.all(_.map(orders, order => verifyOrder(orderList, order)));
        }

        /**
         *
         * @param orderResult
         * @returns {{
         *  orderId: Number,
         *  nextId: Number,
         *  account: String,
         *  quantity: Number,
         *  pricePerCoin: Number,
         *  originalQuantity: Number,
         *  expirationTime: Number
         * }}
         */
        function toOrderObject(orderResult) {
            return {
                orderId: orderResult[0].toNumber(),
                nextId: orderResult[1].toNumber(),
                previousId: orderResult[2].toNumber(),
                account: orderResult[3],
                quantity: orderResult[4].toNumber(),
                originalQuantity: orderResult[5].toNumber(),
                pricePerCoin: orderResult[6].toNumber(),
                expirationTime: orderResult[7].toNumber()
            };
        }

        function verifyOrder(orderList, expected) {
            return Promise.resolve()
                .then(() => orderList.get(expected.orderId))
                .then(result => {
                    var order = toOrderObject(result);

                    assert.equal(order.orderId, expected.orderId,
                        'Expected orderId to be ' + expected.orderId + '; got ' + order.orderId);

                    assert.equal(order.nextId, expected.nextId,
                        'Expected nextId to be ' + expected.nextId + '; got ' + order.nextId);

                    assert.equal(order.account, expected.userAddress,
                        'Expected account to be ' + expected.account + '; got ' + order.account);

                    assert.equal(order.quantity, expected.quantity,
                        'Expected quantity to be ' + expected.quantity + '; got ' + order.quantity);

                    assert.equal(order.pricePerCoin, expected.pricePerCoin,
                        'Expected pricePerCoin to be ' + expected.pricePerCoin + '; got ' + order.pricePerCoin);
                });
        }

        /**
         *
         * @param orderSummary
         * @returns {{firstId: Number, count: Number, nextOrderId: Number}}
         */
        function toOrderSummary(orderSummary) {
            return {
                firstId: orderSummary[0].toNumber(),
                count: orderSummary[1].toNumber(),
                nextOrderId: orderSummary[2].toNumber()
            };
        }

        function verifyOrderSummary(orderList, expected) {
            return Promise.all([
                orderList.first(),
                orderList.size(),
                orderList.nextOrderId()
            ]).then(result => {
                var summary = toOrderSummary(result);

                assert.equal(summary.firstId, expected.firstId,
                    'expected first order id to be ' + expected.firstId + '; got ' + summary.firstId);
                assert.equal(summary.count, expected.count,
                    'expected order count to be ' + expected.count + '; got ' + summary.count);
                assert.equal(summary.nextOrderId, expected.nextOrderId,
                    'expected next order id to be ' + expected.nextOrderId + '; got ' + summary.nextOrderId);
            });
        }

        before('load variables', () => {
            greatCoinPromise = contracts.GxCoin.promised;
            gxOrdersPromise = contracts.GxOrders.promised;
            gxCancelOrders = contracts.GxCancelOrders.promised;
            tradersPromise = contracts.GxTraders.promised;
            gxBuyOrders = contracts.GxBuyOrders.promised;
            gxSellOrders = contracts.GxSellOrders.promised;
            gxCoinTotalsPromise = contracts.GxCoinTotals.promised;
            gxAdminOperationsPromise = contracts.GxAdminOperations.promised;
        });

        it('should default to setting the maximum number of coins to 75 million', function() {
            return assertCoinLimit(75 * MILLION);
        });

        it('should not allow for setting the maximum number of createable coins above 75 million', function() {
            return gxCoinTotalsPromise.setCoinLimit(80 * MILLION)
                .then(() => assertCoinLimit(75 * MILLION));
        });

        it('should allow for setting the maximum number of createable coins', function() {
            return gxCoinTotalsPromise.setCoinLimit(50 * MILLION)
                .then(() => assertCoinLimit(50 * MILLION));
        });

        it('should allow an unregistered trader account to be registered', function() {
            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.unregisterTraderAccount(traderAddress, { gas: DEFAULT_GAS.UNREGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.contains(traderAddress))
                .then(result => assert.equal(result, false))

                .then(() => gxAdminOperationsPromise.registerTraderAccount(traderAddress, { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.contains(traderAddress))
                .then(result => assert.equal(result, true));
        });

        it('should allow a registered trader account to be unregistered', function() {
            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.registerTraderAccount(traderAddress, { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.contains(traderAddress))
                .then(result => assert.equal(result, true))

                .then(() => gxAdminOperationsPromise.unregisterTraderAccount(traderAddress, { gas: DEFAULT_GAS.UNREGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.contains(traderAddress))
                .then(result => assert.equal(result, false));
        });

        it('should not allow GreatCoins to be seeded to non-registered account', function() {
            let traderAccount = accounts[2];
            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.unregisterTraderAccount(traderAccount, { gas: DEFAULT_GAS.UNREGISTER_TRADER_ACCOUNT }))
                .then(() => gxAdminOperationsPromise.seedCoins(traderAccount, basicAmount, 'some notes', 1, { gas: DEFAULT_GAS.SEED_COINS }))
                .then(() => tradersPromise.coinBalance(traderAccount))
                .then(result => assert.equal(result.toNumber(), 0));
        });

        it('should allow GreatCoins to be seeded to registered account', function() {
            return gxAdminOperationsPromise.registerTraderAccount(accounts[0], { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT})
                .then(() => gxAdminOperationsPromise.seedCoins(accounts[0], basicAmount, 'some notes', 1, { gas: DEFAULT_GAS.SEED_COINS }))
                .then(() => tradersPromise.coinBalance(accounts[0]))
                .then(result2 => assert.equal(result2.toNumber(), basicAmount));
        });

        it('should not allow seeding coins for null account', () =>
            gxAdminOperationsPromise.seedCoins(null, basicAmount + 1, 'some notes', 1, { gas: DEFAULT_GAS.SEED_COINS })
                .then(() => tradersPromise.coinBalance(null))
                .then(result => assert.equal(result.toNumber(), 0)));

        it('should keep track of total number of seeded coins', () =>
            gxCoinTotalsPromise.totalCoins()
                .then(result => assert.equal(result.toNumber(), basicAmount)));

        it('should not allow creation of more coins than coin limit', function() {
            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.seedCoins(accounts[0], 50 * MILLION, 'some notes', 1, { gas: DEFAULT_GAS.SEED_COINS }))
                .then(() => tradersPromise.coinBalance(accounts[0]))
                .then(result => assert.equal(result.toNumber(), basicAmount))

                .then(() => gxCoinTotalsPromise.totalCoins())
                .then(result => assert.equal(result.toNumber(), basicAmount));
        });

        it('should not allow for creation of buy orders without available funds', function() {
            return Promise.resolve()
                .then(() => gxOrdersPromise.createOrder(1, 1, 0, true, { gas: DEFAULT_GAS.CREATE_BUY_ORDER }))
                .then(result => verifyOrderSummary(gxBuyOrders, { firstId: 0, count: 0, nextOrderId: 1 }));
        });

        it('should allow funding of trading account', function() {
            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.fund(accounts[0], 4000000, { gas: DEFAULT_GAS.FUND }))
                .then(() => tradersPromise.dollarBalance(accounts[0]))
                .then(result => assert.equal(result, 4000000))

                .then(() => gxAdminOperationsPromise.fund(accounts[0], 6000000, { gas: DEFAULT_GAS.FUND }))
                .then(() => tradersPromise.dollarBalance(accounts[0]))
                .then(result => assert.equal(result, 10000000));
        });

        it('should not allow for creation of buy orders without trading being open', function() {
            return Promise.resolve()
                .then(()=> greatCoinPromise.setTradingOpen(false))
                .then(()=> gxOrdersPromise.createOrder(1, 1, 0, true, { gas: DEFAULT_GAS.CREATE_BUY_ORDER }))
                .then(result => verifyOrderSummary(gxBuyOrders, { firstId: 0, count: 0, nextOrderId: 1 }));
        });

        it('should set trading open', () =>
            Promise.resolve()
                .then(() => greatCoinPromise.isTradingOpen())
                .then(open => assert.equal(open, false, 'trading should be closed'))

                .then(() => greatCoinPromise.setTradingOpen(true, { gas: DEFAULT_GAS.SET_TRADING_OPEN }))

                .then(() => greatCoinPromise.isTradingOpen())
                .then(open => assert.equal(open, true, 'trading should be open')));

        it('should not allow creation of buy orders when not authorized on buy orders contract', function() {
            let owner = contracts.GxOrders.address;
            let contract = contracts.GxBuyOrders.promised;
            return Promise.resolve()
                // confirm that gxOrders is owner
                .then(() => contract.isOwner(owner))
                .then(isOwner => assert.equal(isOwner, true, 'should be owner at the beginning of the test'))

                // remove gxOrders authorization
                .then(() => contract.removeOwner(owner))

                // confirm that gxOrders is no longer owner
                .then(() => contract.isOwner(owner))
                .then(isOwner => assert.equal(isOwner, false, 'should not be owner after calling removeOwner'))

                // try to create a buy order
                .then(() => new Order(1, 20, 100, primaryAddress).createBuyOrderPromise())

                // verify that no order was created and nextOrderId was not incremented
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 0, count: 0, nextOrderId: 1 }))

                .then(() => contract.addOwner(owner))

                // confirm that gxOrders is no longer owner
                .then(() => contract.isOwner(owner))
                .then(isOwner => assert.equal(isOwner, true, 'should be owner after calling addOwner'));
        });

        it('should allow creation of buy orders when trading is open', function() {
            var buyOrder = new Order(1, 20, 100, primaryAddress);

            return buyOrder.createBuyOrderPromise()
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 1, count: 1, nextOrderId: 2 }))
                .then(() => verifyOrder(gxBuyOrders, buyOrder));
        });

        // this test is built on top of the previous test
        it('should deduct available funds during creation of buy orders', () =>
            tradersPromise.dollarBalance(primaryAddress)
                .then(result => assert.equal(result.toNumber(), 10000000 - (20 * 100))));

        // this test is built on top of the previous test
        it('should allow for iterating though the collection of buy orders', function() {
            // order from test above, will be first in ledger
            var o1 = new Order(1, 20, 100, primaryAddress, 4);

            var o2 = new Order(2, 200, 101, primaryAddress, 1);
            var o3 = new Order(3, 20, 102, primaryAddress, 2);
            var o4 = new Order(4, 200, 99, primaryAddress, 0);

            var orders = [o1, o2, o3, o4];
            return Promise.resolve()
                .then(() => createOrders([o2, o3, o4], true))
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 3, count: 4, nextOrderId: 5 }))
                .then(() => verifyOrders(gxBuyOrders, orders));
        });

        // this test is built on top of the previous test
        it('should deduct available funds during creation of additional buy orders', () =>
            tradersPromise.dollarBalance(primaryAddress)
                // Note: this represents all the buy orders created to now and will be used going forward ...
                .then(result => assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102) + (200 * 99)))));

        it('should credit balance after cancelling buy orders', function() {
            return Promise.resolve()
                .then(() => gxCancelOrders.cancelOrder(4, true, { gas: DEFAULT_GAS.CANCEL_ORDER}))
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(result => assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102))))

                // the buy order #4 is no longer present with the returned ID 0
                .then(() => gxBuyOrders.get(4))
                .then(buyOrderResults => assert.equal(toOrderObject(buyOrderResults).orderId, 0))

                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 3, count: 3, nextOrderId: 5 }));
        });

        it('should allow for creation of sell orders', function() {
            var sellOrder = new Order(1, 1, 1000, primaryAddress);
            return sellOrder.createSellOrderPromise()
                .then(() => verifyOrder(gxSellOrders, sellOrder));
        });

        // this test is built on top of the previous test
        it('should allow for iterating though the collection of sales orders', function() {
            var so1 = new Order(1, 1, 1000, primaryAddress, 3);
            var so2 = new Order(2, 2, 1020, primaryAddress, 0);
            var so3 = new Order(3, 3, 1001, primaryAddress, 4);
            var so4 = new Order(4, 3, 1005, primaryAddress, 2);

            var sellOrders = [so1, so2, so3, so4];

            return createOrders([so2, so3, so4], false)
                .then(info => verifyOrderSummary(gxSellOrders, { firstId: 1, count: 4, nextOrderId: 5 }))
                .then(() => verifyOrders(sellOrders, false));
        });

        // this test is built on top of the previous test
        it('should deduct coins during creation of sales orders', () =>
            tradersPromise.coinBalance(primaryAddress)
                .then(result => assert.equal(result, basicAmount - (1 + 2 + 3 + 3))));

        it('should refund coins if sales orders are cancelled', function() {
            return Promise.resolve()
                .then(() => gxCancelOrders.cancelOrder(4, false, { gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(result => assert.equal(result, basicAmount - (1 + 2 + 3)))
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 1, count: 3, nextOrderId: 5 }));
        });

        it('should match valid sales orders with buy orders', function() {
            var matchedSellOrder = new Order(5, 10, 100, traderAddress);

            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.registerTraderAccount(traderAddress, { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))
                .then(() => gxAdminOperationsPromise.seedCoins(traderAddress, basicAmount, 'some notes', 1, { gas: DEFAULT_GAS.SEED_COINS }))
                .then(() => tradersPromise.coinBalance(traderAddress))
                .then(result => assert.equal(result, basicAmount))

                .then(() => matchedSellOrder.createSellOrderPromise())

                .then(() => tradersPromise.coinBalance(traderAddress))
                .then(result2 => assert.equal(result2, basicAmount - 10))

                // the maxId of the sell order list is now 5, but the active order count is still 3
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 1, count: 3, nextOrderId: 6 }))

                // the sell order is not in the queue
                .then(() => gxSellOrders.get(5))
                .then(sellOrderResults => assert.equal(toOrderObject(sellOrderResults).orderId, 0))

                .then(() => tradersPromise.dollarBalance(traderAddress))
                .then(balance => assert.equal(balance, 10 * 100));
        });

        it('should refund available balance if buy pricePerCoin is greater than sales pricePer', function() {
            return Promise.resolve()
                //Note: in previous test we matched a sales order for 10 coins at 100 per against a buy order
                //  of 20 coins at 102 per, so 20 must be refunded to available balance
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(result => assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20))

                // orderId, nextId, account, quantity, pricePer
                .then(() => verifyOrder(gxBuyOrders, new Order(3, 20 - 10, 102, primaryAddress, 2)))

                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(coin => assert.equal(coin, basicAmount - (1 + 2 + 3) + 10));
        });

        it('should delete buy orders if fully matched', function() {
            var sellOrder = new Order(6, 15, 100, traderAddress);
            var buyOrder2 = new Order(2, 200 - 5, 101, primaryAddress, 1);

            return Promise.resolve()
                .then(() => sellOrder.createSellOrderPromise())
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 2, count: 2, nextOrderId: 5 }))
                .then(() => verifyOrder(gxBuyOrders, buyOrder2))

                //Note: here we matched a sales order for 15 coins at 100 per against a buy order
                //  of 10 coins at 102 per and a second buy order of 100 coins at 101 per,
                // so the buyer should gain 15 coins and 25 must be refunded to available balance
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(coin => assert.equal(coin.toNumber(), basicAmount - (1 + 2 + 3) + 10 + 15))
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(result => assert.equal(result.toNumber(), 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20 + 25))

                // and the seller should get 15 * 1000 added to the dollar balance
                .then(() => tradersPromise.dollarBalance(traderAddress))
                .then(result => assert.equal(result, (10 + 15) * 100));
        });

        it('should delete sell orders if fully matched', function() {
            var buyOrder = new Order(5, 2, 1001, traderAddress);
            // this sell order is already created
            var sellOrder3 = new Order(3, 3 - 1, 1001, primaryAddress, 2);

            return Promise.resolve()
                .then(() => buyOrder.createBuyOrderPromise())

                // sell order #1 is now fully matched and deleted
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 3, count: 2, nextOrderId: 7 }))
                .then(() => verifyOrder(gxSellOrders, sellOrder3))

                //Note: here we matched a buy order for 2 coins at 1001 per against a sell order
                //  of 1 coins at 1000 per and a second buy order of 2 coins at 1001 per,
                // so the buyer should gain 2 coins, costing only 1000 + 1001
                .then(() => tradersPromise.coinBalance(buyOrder.userAddress))
                .then(coin => assert.equal(coin, basicAmount - 25 + 2))
                .then(() => tradersPromise.dollarBalance(sellOrder3.userAddress))
                .then(result => assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20 + 25 + 1000 + 1001))

                // check the buyer's dollar balance
                .then(() => tradersPromise.dollarBalance(buyOrder.userAddress))
                .then(result => assert.equal(result, (10 + 15) * 100 - (1000 + 1001)));
        });

        it('should allow for cancelling of partially fulfilled sell orders and crediting coins', function() {
            return Promise.resolve()
                .then(() => gxCancelOrders.cancelOrder(3, false, { gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(result => assert.equal(result, basicAmount - (1 + 2 + 3) + 10 + 15 + (3 - 1)))

                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 2, count: 1, nextOrderId: 7 }));
        });

        it('should allow for cancelling of partially fulfilled buy orders and getting refund', function() {
            return Promise.resolve()
                .then(() => gxCancelOrders.cancelOrder(2, true, { gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(result => assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20 + 25 + 1000 + 1001 + (200 - 5) * 101))
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 1, count: 1, nextOrderId: 6 }));
        });

        it('should not allow to cancel sales order created by others or otherwise not present', function() {
            var sellOrder = new Order(7, 1, 1000, traderAddress);

            return Promise.resolve()
                .then(() => sellOrder.createSellOrderPromise())

                .then(() => gxCancelOrders.cancelOrder(sellOrder.orderId, false, { gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 7, count: 2, nextOrderId: 8 }))

                .then(() => gxCancelOrders.cancelOrder(sellOrder.orderId, false, { from: sellOrder.userAddress, gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 2, count: 1, nextOrderId: 8 }));
        });

        it('should not allow to cancel buy order created by others or otherwise not present', function() {
            var buyOrder = new Order(6, 1, 105, traderAddress);
            return Promise.resolve()
                .then(() => buyOrder.createBuyOrderPromise())

                .then(() => gxCancelOrders.cancelOrder(buyOrder.orderId, true, { gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 6, count: 2, nextOrderId: 7 }))

                .then(() => gxCancelOrders.cancelOrder(buyOrder.orderId, true, { from: buyOrder.userAddress, gas: DEFAULT_GAS.CANCEL_ORDER }))
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 1, count: 1, nextOrderId: 7, gas: DEFAULT_GAS.CANCEL_ORDER }));
        });

        it('should cancel the remainder of the buy order after partial matches to preventing out-of-gas error', function() {
            var buyOrder = new Order(7, 3, 1020, primaryAddress, 0, 375000);
            var sellOrder = new Order(8, 2, 1020, primaryAddress);

            var initialBalance;

            return Promise.resolve()
                .then(() => sellOrder.createSellOrderPromise())
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(r => initialBalance = parseInt(r))
                .then(() => buyOrder.createBuyOrderPromise())

                // the first buyOrder ID is still 1, not the higher bid order 7
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 1, count: 1, nextOrderId: 8 }))

                // verify that the sell order #1 is matched and there is an remaining sell order #8 that could have matched the buy order
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 8, count: 1, nextOrderId: 9 }))

                // check that only 2 is bought
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(balance => assert.equal(balance.toNumber(), initialBalance + 2));
        });

        it('should not cancel the remainder of the buy order after partial matches if the sell orders are fully matched', function() {
            var buyOrder = new Order(8, 3, 1020, primaryAddress, 0, 375000);
            var initialBalance;

            return Promise.resolve()
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(r => initialBalance = parseInt(r))
                .then(() => buyOrder.createBuyOrderPromise())

                // the first buyOrder ID is now 8
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 8, count: 2, nextOrderId: 9 }))

                // verify that the sell order #8 is matched
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 0, count: 0, nextOrderId: 9 }))

                // check that only 2 is bought
                .then(() => tradersPromise.coinBalance(primaryAddress))
                .then(balance => assert.equal(balance.toNumber(), initialBalance + 2));
        });

        it('should cancel the remainder of the sell order after partial matches to preventing out-of-gas error', function() {
            var sellOrder = new Order(9, 3, 90, primaryAddress, 0, 375000);
            var initialBalance;

            return Promise.resolve()
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(r => initialBalance = parseInt(r))

                .then(() => sellOrder.createSellOrderPromise())
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 0, count: 0, nextOrderId: 10 }))

                // verify that the buy order #8 is matched and there is still buyOrder #1
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 1, count: 1, nextOrderId: 9 }))

                // check that the dollar balance, the transaction happens to the same account
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(balance => assert.equal(balance.toNumber(), initialBalance + 1020));
        });

        it('should not cancel the remainder of the sell order after partial matches if the buy orders are fully matched', function() {
            var sellOrder = new Order(10, 30, 90, primaryAddress);
            var initialBalance;

            return Promise.resolve()
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(r => initialBalance = parseInt(r))

                .then(() => sellOrder.createSellOrderPromise())
                .then(() => verifyOrderSummary(gxSellOrders, { firstId: 10, count: 1, nextOrderId: 11 }))

                // verify that the buy order is matched and there is no outstanding buy orders
                .then(() => verifyOrderSummary(gxBuyOrders, { firstId: 0, count: 0, nextOrderId: 9 }))

                // check that the dollar balance, the transaction happens to the same account
                .then(() => tradersPromise.dollarBalance(primaryAddress))
                .then(r => assert.equal(parseInt(r), initialBalance + 20 * 100));
        });

        it('should apply refunds as requested by an admin', function() {
            var initialBalance;
            return Promise.resolve()
                .then(() => tradersPromise.dollarBalance(accounts[0]))
                .then(result => initialBalance = result)

                .then(() => gxAdminOperationsPromise.adjustCash(accounts[0], -7000000, ''))
                .then(() => tradersPromise.dollarBalance(accounts[0]))
                .then(result => assert.equal(result, initialBalance - 7000000, ''))

                .then(() => gxAdminOperationsPromise.adjustCash(accounts[0], 7000000 - initialBalance, ''))
                .then(() => tradersPromise.dollarBalance(accounts[0]))
                .then(result => assert.equal(result, 0));
        });

        it('should return the length of the trader list when requested', function() {
            return Promise.resolve()
                .then(() => tradersPromise.length())
                .then(r => assert.equal(r, 3))

                .then(() => gxAdminOperationsPromise.registerTraderAccount(accounts[9], { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.length())
                .then(r => assert.equal(r, 4))

                .then(() => gxAdminOperationsPromise.unregisterTraderAccount(accounts[0], { gas: DEFAULT_GAS.UNREGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.length())
                .then(r => assert.equal(r, 4))

                .then(() => gxAdminOperationsPromise.registerTraderAccount(accounts[0], { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))
                .then(() => tradersPromise.length())
                .then(r => assert.equal(r, 5));
        });

        it('should allow admin user to cancel any pending sell orders', function() {
            // set up another trader
            var trader3 = accounts[3];
            var sellOrder = new Order(11, 10, 3000, trader3);

            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.registerTraderAccount(trader3, { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))

                .then(() => gxAdminOperationsPromise.seedCoins(trader3, basicAmount, 'some notes', 1, { gas: DEFAULT_GAS.SEED_COINS }))
                .then(() => tradersPromise.coinBalance(trader3))
                .then(result => assert(result, basicAmount))

                .then(() => sellOrder.createSellOrderPromise())
                .then(() => tradersPromise.coinBalance(trader3))
                .then(result => assert.equal(result, basicAmount - sellOrder.quantity))

                // check that the sell order from trader3 is cancelled
                .then(() => gxCancelOrders.cancelOrderByAdmin(sellOrder.orderId, false, { gas: DEFAULT_GAS.CANCEL_ORDER_BY_ADMIN }))
                .then(() => tradersPromise.coinBalance(trader3))
                .then(result => assert.equal(result, basicAmount));
        });

        it('should allow admin user to cancel any pending buy orders', function() {
            // set up another trader
            var trader3 = accounts[3];
            var buyOrder = new Order(9, 10, 10, trader3);

            return Promise.resolve()
                .then(() => gxAdminOperationsPromise.fund(trader3, 100000))
                .then(() => tradersPromise.dollarBalance(trader3))
                .then(result => assert.equal(result, 100000))

                .then(() => buyOrder.createBuyOrderPromise())
                .then(() => tradersPromise.dollarBalance(trader3))
                .then(result => assert.equal(result, 100000 - buyOrder.quantity * buyOrder.pricePerCoin))

                .then(() => gxCancelOrders.cancelOrderByAdmin(buyOrder.orderId, true, { gas: DEFAULT_GAS.CANCEL_ORDER_BY_ADMIN }))

                // check that the buy order from trader3 is cancelled
                .then(() => tradersPromise.dollarBalance(trader3))
                .then(result => assert.equal(result, 100000));
        });

        it('should allow admin user to transfer the balances of one account to another', function() {
            var trader3 = accounts[3];
            var trader5 = accounts[5];
            var totalCoins;

            return Promise.resolve()
                .then(() => gxCoinTotalsPromise.totalCoins())
                .then(res => totalCoins = parseInt(res))

                .then(() => gxAdminOperationsPromise.transferTraderBalance(trader3, trader5, { gas: DEFAULT_GAS.TRANSFER_TRADER_BALANCE }))
                .then(() => tradersPromise.dollarBalance(trader5))
                .then(result => assert.equal(result, 100000))
                .then(() => tradersPromise.coinBalance(trader5))
                .then(result => assert.equal(result, basicAmount))

                // check that trader3 is unregistered
                .then(() => tradersPromise.contains(trader3))
                .then(res => assert.ok(!res))

                // check that the totalCoins of the contract is unchanged.
                .then(() => gxCoinTotalsPromise.totalCoins())
                .then(res => assert.equal(res, totalCoins));
        });
    });

    describe('GxCoin withdraw() method', function() {
        var gxCoin;
        var gxTraders;
        var gxAdminOperations;
        var account;

        before(() => {
            gxCoin = contracts.GxCoin.promised;
            gxTraders = contracts.GxTraders.promised;
            gxAdminOperations = contracts.GxAdminOperations.promised;
            account = accounts[8];

            return commonFunctions.beforeTraderTest(account);
        });
        after(() => commonFunctions.afterTraderTests(account));
        beforeEach(() => commonFunctions.assertZeroDollarBalance(account));
        afterEach(() => commonFunctions.clearDollarBalance(account));

        it('should change test account dollar balance when called by test account', () => {
            let amount = 317414;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded')

                .then(() => gxCoin.withdraw(amount, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should not have any dollar balance after withdrawing');
        });

        it('should not change test account dollar balance when called different account', () => {
            let amount = 139875;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded')

                .then(() => gxCoin.withdraw(amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was originally funded');
        });

        it('should allow test account to withdraw partial amounts', () => {
            let amount = 508703;

            let withdraw1 = 314345;
            let withdraw2 = amount - withdraw1;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded')

                .then(() => gxCoin.withdraw(withdraw1, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount - withdraw1),
                    'test account should not have funded dollar balance less first withdraw')

                .then(() => gxCoin.withdraw(withdraw2, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should not have any dollar balance after second withdrawal');
        });

        it('should not allow test account to withdraw more than balance', () => {
            let amount = 876685;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded')

                .then(() => gxCoin.withdraw(amount + 1, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should still have ' + amount + ' cents that was funded');
        });

        it('should not allow test account to withdraw negative amounts', () => {
            let amount = -100;
            let result = 13151;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, result))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), result),
                    'test account should have ' + result + ' cents that was funded')

                .then(() => gxCoin.withdraw(amount, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), result),
                    'test account should still have ' + result + ' cents balance');
        });
    });

    describe('GxAdminOperations adminCancelWithdrawal() method', function() {
        var gxCoin;
        var gxTraders;
        var gxAdminOperations;
        var account;

        before(() => {
            gxTraders = contracts.GxTraders.promised;
            gxCoin = contracts.GxCoin.promised;
            gxAdminOperations = contracts.GxAdminOperations.promised;
            account = accounts[8];

            return commonFunctions.beforeTraderTest(account);
        });
        after(() => commonFunctions.afterTraderTests(account));
        beforeEach(() => commonFunctions.assertZeroDollarBalance(account));
        afterEach(() => commonFunctions.clearDollarBalance(account));

        it('should change dollar balance after one cancellation', () => {
            let amount = 92474;

            return Promise.resolve()
                .then(() => gxAdminOperations.adminCancelWithdrawal(account, amount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))
                .then(transactionReceipt => transactionMethods.decodeEventLogs(
                    transactionReceipt.logs,
                    contracts.GxEvents.contract.DollarsWithdrawalCancelled))
                .then(events => {
                    assert.equal(events.length, 1, 'should raise one event withdrawal cancelled event');
                    let event = events[0];
                    assert.equal(event.args.balanceDollars.toNumber(), amount);
                    assert.equal(event.args.amountDollars.toNumber(), amount);
                })
                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded')

                .then(() => gxCoin.withdraw(amount, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should not have any dollar balance after withdrawing');
        });


        it('should change dollar balance after two cancellations', () => {
            let amount1 = 92474;
            let amount2 = 537;
            let balance = amount1 + amount2;

            return Promise.resolve()
                .then(() => gxAdminOperations.adminCancelWithdrawal(account, amount1, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))
                .then(transactionReceipt => transactionMethods.decodeEventLogs(
                    transactionReceipt.logs,
                    contracts.GxEvents.contract.DollarsWithdrawalCancelled))
                .then(events => {
                    assert.equal(events.length, 1, 'should raise one event withdrawal cancelled event');
                    let event = events[0];
                    assert.equal(event.args.balanceDollars.toNumber(), amount1);
                    assert.equal(event.args.amountDollars.toNumber(), amount1);
                })

                .then(() => gxAdminOperations.adminCancelWithdrawal(account, amount2, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))
                .then(transactionReceipt => transactionMethods.decodeEventLogs(
                    transactionReceipt.logs,
                    contracts.GxEvents.contract.DollarsWithdrawalCancelled))
                .then(events => {
                    assert.equal(events.length, 1, 'should raise one event withdrawal cancelled event');
                    let event = events[0];
                    assert.equal(event.args.balanceDollars.toNumber(), balance);
                    assert.equal(event.args.amountDollars.toNumber(), amount2);
                })

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), balance),
                    'test account should have ' + balance + ' cents that was funded')

                .then(() => gxCoin.withdraw(amount1, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount2),
                    'test account should have ' + amount2 + ' left after withdrawing ' + amount1 + ' from ' + balance)

                .then(() => gxCoin.withdraw(amount2, { from: account }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should have 0 left after withdrawing everything');
        });

    });

    describe('GxCoin fund() method', function() {
        var gxCoin;
        var gxTraders;
        var gxAdminOperations;
        var account;

        // load variables, register the test account and sanity checks
        before(() => {
            gxCoin = contracts.GxCoin.promised;
            gxTraders = contracts.GxTraders.promised;
            gxAdminOperations = contracts.GxAdminOperations.promised;
            account = accounts[8];

            return commonFunctions.beforeTraderTest(account);
        });
        after(() => commonFunctions.afterTraderTests(account));
        beforeEach(() => commonFunctions.assertZeroDollarBalance(account));
        afterEach(() => commonFunctions.clearDollarBalance(account));

        it('should allow to fund test account by admin', () => {
            let amount = 18448145;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded');
        });

        it('should not allow for test account to fund themselves', () => {
            let amount = 981365;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount, { from: account }))
                .then(() => assertNeverGetsCalled())
                .catch(error => assertSolidityException(error))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should have 0 balance');
        });

        it('should allow to fund test account with negative amount', () => {
            let amount = 9713935;
            let secondFundAmount = -319534;

            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, amount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), amount),
                    'test account should have ' + amount + ' cents that was funded')

                .then(() => gxAdminOperations.fund(account, secondFundAmount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance =>
                   assert.equal(dollarBalance.toNumber(), amount + secondFundAmount),
                    'test account should have funded amount less negative adjustment amount');
        });
    });

    describe('GxCoin adjustCash() method', function() {
        var gxCoin;
        var gxAdminOperations;
        var gxTraders;
        var account;

        before(() => {
            gxCoin = contracts.GxCoin.promised;
            gxAdminOperations = contracts.GxAdminOperations.promised;
            gxTraders = contracts.GxTraders.promised;
            account = accounts[8];

            return commonFunctions.beforeTraderTest(account);
        });
        after(() => commonFunctions.afterTraderTests(account));
        beforeEach(() => commonFunctions.assertZeroCoinBalance(account));
        afterEach(() => commonFunctions.clearCoinBalance(account));

        it('should not change coin balance if called by trader account', () => {
            let coinAmount = 1845;
            return Promise.resolve()
                .then(() => gxAdminOperations.seedCoins(account, coinAmount, '', 100))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount),
                    'test account should have been seeded ' + coinAmount + ' coins')

                .then(() => gxAdminOperations.adjustCoins(account, -1, '', { from: account }))
                .then(() => assertNeverGetsCalled())
                .catch(error => assertSolidityException(error))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount),
                    'test account should have still have ' + coinAmount + ' coins');
        });

        it('should change coin balance when called by admin', () => {
            let coinAmount = 31894;
            let adjustmentAmount = 1;
            return Promise.resolve()
                .then(() => gxAdminOperations.seedCoins(account, coinAmount, '', 100))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount),
                    'test account should have been seeded ' + coinAmount + ' coins')

                .then(() => gxAdminOperations.adjustCoins(account, -adjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount - adjustmentAmount),
                    'test account should have still have ' + (coinAmount - adjustmentAmount) + ' coins');
        });

        it('should not change coin balance when called with amount more than coin balance', () => {
            let coinAmount = 6847;
            let adjustmentAmount = coinAmount + 1;
            return Promise.resolve()
                .then(() => gxAdminOperations.seedCoins(account, coinAmount, '', 100))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount),
                    'test account should have been seeded ' + coinAmount + ' coins')

                .then(() => gxAdminOperations.adjustCoins(account, -adjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount),
                    'test account should have still have ' + coinAmount + ' coins');
        });

        it('should have no coins left when called with exactly the coin balance', () => {
            let coinAmount = 3535;
            let adjustmentAmount = coinAmount;
            return Promise.resolve()
                .then(() => gxAdminOperations.seedCoins(account, coinAmount, '', 100))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), coinAmount),
                    'test account should have been seeded ' + coinAmount + ' coins')

                .then(() => gxAdminOperations.adjustCoins(account, -adjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), 0),
                    'test account should have still have 0 coins because the adjustment was exactly the balance');
        });
    });

    describe('GxCoin adjustCash() method', function() {
        var gxCoin;
        var gxTraders;
        var gxAdminOperations;
        var account;

        before(() => {
            gxCoin = contracts.GxCoin.promised;
            gxTraders = contracts.GxTraders.promised;
            gxAdminOperations = contracts.GxAdminOperations.promised;
            account = accounts[8];

            return commonFunctions.beforeTraderTest(account);
        });
        after(() => commonFunctions.afterTraderTests(account));
        beforeEach(() => commonFunctions.assertZeroCoinBalance(account));
        afterEach(() => commonFunctions.clearCoinBalance(account));

        it('should increase dollar balance when called by admin', () => {
            let usdAmount = 18448145;
            let usdAdjustmentAmount = 1;
            return Promise.resolve()
                .then(() => gxAdminOperations.fund(account, usdAmount))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxAdminOperations.adjustCash(account, usdAdjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => {
                    return gxTraders.dollarBalance(account);
                })
                .then(dollarBalance =>
                    assert.equal(dollarBalance.toNumber(), usdAmount + usdAdjustmentAmount),
                    'test account should have still have ' + (usdAmount + usdAdjustmentAmount) + ' dollars');
        });

        it('should decrease dollar balance when called by admin', () => {
            let usdAmount = 18448146;
            let usdAdjustmentAmount = -1;
            return Promise.resolve()
                .then(() => gxAdminOperations.adjustCash(account, usdAdjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), usdAmount + usdAdjustmentAmount),
                    'test account should have still have ' + (usdAmount + usdAdjustmentAmount) + ' dollars');
        });

        it('should not change dollar balance when called with usdAdjustmentAmount more than dollar balance', () => {
            let usdAmount = 18448145;
            let usdAdjustmentAmount = -18448146;
            return Promise.resolve()
                .then(() => gxAdminOperations.adjustCash(account, usdAdjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), usdAmount),
                    'test account should have still have ' + usdAmount + ' dollars');
        });

        it('should not change dollar balance if called by trader account', () => {
            let usdAmount = 18448145;
            let usdAdjustmentAmount = 1;
            return Promise.resolve()
                .then(() => gxAdminOperations.adjustCash(account, usdAdjustmentAmount, '', { from: account }))
                .then(() => assertNeverGetsCalled())
                .catch(error => assertSolidityException(error))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), usdAmount),
                    'test account should have still have ' + usdAmount + ' dollars');
        });

        it('should have no dollars left when called with exactly the dollars balance', () => {
            let usdAmount = 18448145;
            let usdAdjustmentAmount = -18448145;
            return Promise.resolve()

                .then(() => gxAdminOperations.adjustCash(account, usdAdjustmentAmount, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should have' + usdAmount + ' dollars');
        });

    });

    describe('GxCoinTotals setTotalCoins() method', function() {
        var gxCoinTotals;

        before(() => {
            gxCoinTotals = contracts.GxCoinTotals.promised;
        });

        it('should set totalCoins', () => {
            let originalTotalCoins;
            let newTotalCoins = 53854;

            return Promise.resolve()
                .then(() => gxCoinTotals.totalCoins())
                .then(result => originalTotalCoins = result.toNumber())

                .then(() => gxCoinTotals.setTotalCoins(newTotalCoins))
                .then(() => gxCoinTotals.totalCoins())
                .then(result => assert.equal(newTotalCoins, result.toNumber(), 'totalCoins() should return the new value'))

                .then(() => gxCoinTotals.setTotalCoins(originalTotalCoins))
                .then(() => gxCoinTotals.totalCoins())
                .then(result => assert.equal(originalTotalCoins, result.toNumber(), 'totalCoins() should return the original coins'));
        });
    });

    describe('GxCoin transferTraderBalance() method should not change trading state', function() {
        var gxCoin;
        var gxAdminOperations;
        var gxTraders;
        var oldAccount;
        var newAccount;

        before(() => {
            gxCoin = contracts.GxCoin.promised;
            gxAdminOperations = contracts.GxAdminOperations.promised;
            gxTraders = contracts.GxTraders.promised;
            oldAccount = accounts[3];
            newAccount = accounts[4];

            return commonFunctions.beforeTraderTest(oldAccount);
        });

        after(() => {
            commonFunctions.afterTraderTests(oldAccount);
            commonFunctions.afterTraderTests(newAccount);
        });

        beforeEach(() => {
            commonFunctions.assertZeroCoinBalance(oldAccount);
            commonFunctions.assertZeroCoinBalance(newAccount);
            commonFunctions.assertZeroDollarBalance(oldAccount);
            commonFunctions.assertZeroDollarBalance(newAccount);
        });

        afterEach(() => {
            commonFunctions.clearCoinBalance(oldAccount);
            commonFunctions.clearCoinBalance(newAccount);
            commonFunctions.clearDollarBalance(oldAccount);
            commonFunctions.clearDollarBalance(newAccount);
        });

        it('should not disable trading when recovering more coins than totalCoins', () => {
            let gxCoin = contracts.GxCoin.promised;
            let gxAdminOperations = contracts.GxAdminOperations.promised;
            let gxTraders = contracts.GxTraders.promised;
            let gxCoinTotals = contracts.GxCoinTotals.promised;
            let usd = 1337;
            let gxc = 7377;
            let totalCoins;
            let newTotalCoins = gxc - 10; // this issue happens when totalCoins is less than the gxc balance of trader being recovered

            return Promise.resolve()
                .then(() => gxCoin.isTradingOpen())
                .then(open => assert.equal(open, true, 'trading should be initially open'))

                .then(() => gxAdminOperations.adjustCash(oldAccount, usd, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))
                .then(() => gxTraders.dollarBalance(oldAccount))
                .then(balance => assert.equal(balance, usd, 'old account should have dollar balance equal to amount funded'))

                .then(() => gxAdminOperations.seedCoins(oldAccount, gxc, '', 1, { gas: DEFAULT_GAS.SEED_COINS }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))
                .then(() => gxTraders.coinBalance(oldAccount))
                .then(balance => assert.equal(balance, gxc, 'old account should have coin balance equal to coins seeded'))

                .then(() => gxCoinTotals.totalCoins())
                .then(result => totalCoins = result.toNumber())

                .then(() => gxCoinTotals.setTotalCoins(newTotalCoins))
                .then(() => gxCoinTotals.totalCoins())
                .then(result => assert.equal(result, newTotalCoins, 'totalCoins should be set to new value'))

                .then(() => gxAdminOperations.transferTraderBalance(oldAccount, newAccount, { gas: DEFAULT_GAS.TRANSFER_TRADER_BALANCE }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => gxTraders.dollarBalance(oldAccount))
                .then(balance => assert.equal(balance, 0, 'old account should not have any dollar balance remaining after transfer'))
                .then(() => gxTraders.coinBalance(oldAccount))
                .then(balance => assert.equal(balance, 0, 'old account should not have any coin balance remaining after transfer'))

                .then(() => gxTraders.dollarBalance(newAccount))
                .then(balance => assert.equal(balance, usd, 'new account should have correct dollar balance after transfer'))
                .then(() => gxTraders.coinBalance(newAccount))
                .then(balance => assert.equal(balance, gxc, 'new account should have correct coin balance after transfer'))

                .then(() => gxCoin.isTradingOpen())
                .then(open => assert.equal(open, true, 'trading should remain open after transfer'))

                .then(() => gxCoinTotals.setTotalCoins(totalCoins))
                .then(() => gxCoinTotals.totalCoins())
                .then(result => assert.equal(totalCoins, result, 'totalCoins should be reset to original amount'));
        });
    });

    var commonFunctions = {
        beforeTraderTest: function(account) {
            let gxTraders = contracts.GxTraders.promised;
            let gxCoin = contracts.GxCoin.promised;
            let gxAdmins = contracts.GxAdmins.promised;
            let gxAdminOperations = contracts.GxAdminOperations.promised;

            return Promise.resolve()

                // check that test account doesn't have any GXC/USD
                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), 0),
                    'test account should not have any coin balance')

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should not have any dollar balance')

                // check that the test account is not registered
                .then(() => gxTraders.contains(account))
                .then(isTrader => assert.equal(isTrader, false,
                    'test account should not be a registered trader'))

                // check that the test account is not an admin
                .then(() => gxAdmins.contains(account))
                .then(isAdmin => assert.equal(isAdmin, false,
                    'test account should not be an admin'))

                // register the account and confirm the transaction
                .then(() => gxAdminOperations.registerTraderAccount(account, { gas: DEFAULT_GAS.REGISTER_TRADER_ACCOUNT }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                // check that account was registered
                .then(() => gxTraders.contains(account))
                .then(result => assert.equal(result, true,
                    'test account should get registered'));
        },

        afterTraderTests: function(account) {
            let gxCoin = contracts.GxCoin.promised;
            let gxAdminOperations = contracts.GxAdminOperations.promised;
            let gxTraders = contracts.GxTraders.promised;

            return Promise.resolve()

                // unregister account used in tests
                .then(() => gxAdminOperations.unregisterTraderAccount(account, { gas: DEFAULT_GAS.UNREGISTER_TRADER_ACCOUNT }))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                // confirm that it is unregistered
                .then(() => gxTraders.contains(account))
                .then(isTrader => assert.equal(isTrader, false,
                    'test account should have gotten unregistered'))

                // confirm that account has no GXC/USD
                .then(() => gxTraders.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), 0),
                    'test account should not have any coin balance')

                .then(() => gxTraders.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should not have any dollar balance');
        },

        assertZeroDollarBalance: function(account) {
            return Promise.resolve()
                .then(() => contracts.GxTraders.promised.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0),
                    'test account should not have any dollar balance');
        },

        assertZeroCoinBalance: function(account) {
            return Promise.resolve()
                .then(() => contracts.GxTraders.promised.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), 0,
                    'test account should not have any coin balance'));
        },

        clearDollarBalance: function(account) {
            return Promise.resolve()
                .then(() => contracts.GxTraders.promised.dollarBalance(account))
                .then(dollarBalance => contracts.GxAdminOperations.promised.adjustCash(account, -dollarBalance, ''))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => contracts.GxTraders.promised.dollarBalance(account))
                .then(dollarBalance => assert.equal(dollarBalance.toNumber(), 0,
                    'test account should not have any dollar balance'));
        },

        clearCoinBalance: function(account) {
            return Promise.resolve()
                .then(() => contracts.GxTraders.promised.coinBalance(account))
                .then(coinBalance => contracts.GxAdminOperations.promised.adjustCoins(account, -coinBalance, 'clearCoinBalance() common method'))
                .then(tx => transactionMethods.confirmTransaction(web3, tx, blocksToConfirm))

                .then(() => contracts.GxTraders.promised.coinBalance(account))
                .then(coinBalance => assert.equal(coinBalance.toNumber(), 0,
                    'test account should not have any coin balance'));
        }
    };
};

describe('Provider:', function() {
    this.timeout(5000);

    var web3 = new Web3();
    // TestRPC allows for passing gasLimit as an option.  For example:
    //  web3.setProvider(TestRPC.provider(logger, {gasLimit: 500000000}));
    // However, this requires TestRPC 2.0.9.  TestRPC v2.0.7+ will default
    // to Homestead gas limit, prior versions will default to Frontier gas limit
    //
    // Newer versions of TestRPC (including 2.0.7) require NodeJS 5.x+
    web3.setProvider(TestRPC.provider());
    tests(web3);
});
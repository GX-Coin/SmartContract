/**
 * Created by derek.tiffany on 2/14/16.
 */
var Web3 = require('web3');
var fs = require('fs');
var solc = require('solc');
var assert = require('assert');
var TestRPC = require('ethereumjs-testrpc');
var greatCoinAddress;
var gxDeploymentAdminsAddress;
var gxAdminsAddress;
var gxTradersAddress;
var gxOrdersAddress;

var optimize = 1;

console.log('Loading solidity contract sources ...');
var contractsSource = fs.readFileSync('contracts/gxCoin.sol').toString();
var librariesSource = fs.readFileSync('contracts/libraries.sol').toString();
var prevContractsSource = fs.readFileSync('contracts/gxCoin_1_0_0.sol').toString();
var prevlibrariesSource = fs.readFileSync('contracts/libraries_1_0_0.sol').toString();

console.log('Compiling contracts ...');

var input = {
    'libraries.sol': librariesSource,
    'greatCoin.sol': contractsSource,
    'gxCoin_1_0_0.sol': prevContractsSource,
    'libraries_1_0_0.sol': prevlibrariesSource
};

var contractsOutput = solc.compile({sources: input}, optimize);

if (contractsOutput.errors) {

    console.log('Compilation errors! See below:');
    console.log(contractsOutput.errors);
    console.log('Unit tests expected to fail ...');

} else {
    console.log('Continuing with unit tests ...');
}

var tests = function(web3) {
    var accounts;
    var primaryAddress;
    var traderAddress;

    before(function(done) {
        web3.eth.getAccounts(function(err, accs) {
            if (err) {
                return done(err);
            }
            accounts = accs;
            primaryAddress = accs[0];
            traderAddress = accs[2];
            done();
        });
    });

    describe('eth_accounts', function() {
        it('should return 10 addresses', function(done) {
            assert.deepEqual(accounts.length, 10);
            done();
        });
    });

    var iterableAddressMappingTransaction;
    var iterableAddressMappingAddress;

    var iterableAddressBalanceMappingTransaction;
    var iterableAddressBalanceMappingAddress;

    describe('library deployment scenerio', function() {
        it('should deploy IterableAddressMapping library', function(done) {
            var compiledContract = contractsOutput.contracts['IterableAddressMapping'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            web3.eth.sendTransaction({
                from: primaryAddress,
                data: evmCode,
                gas: 3140000
            }, function(err, result) {
                if (err) {
                    return done(err);
                }
                iterableAddressMappingTransaction = result;
                done();
            });
        });

        it('should verify the IterableAddressMapping transaction immediately', function(done) {
            web3.eth.getTransactionReceipt(iterableAddressMappingTransaction, function(err, receipt) {
                if (err) return done(err);

                iterableAddressMappingAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(iterableAddressMappingAddress, null, 'Transaction did not create a contract');
                done();
            });
        });

        it('should deploy IterableAddressBalanceMapping library', function(done) {
            var compiledContract = contractsOutput.contracts['IterableAddressBalanceMapping'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            web3.eth.sendTransaction({
                from: primaryAddress,
                data: evmCode,
                gas: 3140000
            }, function(err, result) {
                if (err) {
                    return done(err);
                }
                iterableAddressBalanceMappingTransaction = result;
                done();
            });
        });

        it('should verify the IterableAddressBalanceMapping transaction immediately', function(done) {
            web3.eth.getTransactionReceipt(iterableAddressBalanceMappingTransaction, function(err, receipt) {
                if (err) {
                    return done(err);
                }

                iterableAddressBalanceMappingAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(iterableAddressBalanceMappingAddress, null, 'Transaction did not create a contract');
                done();
            });
        });
    });

    describe('contract deployment scenario', function() {

        // These are expected to be run in order.
        var greatCoinTransaction;

        it('should add greatCoin contract to the network (eth_sendTransaction)', function(done) {

            var compiledContract = contractsOutput.contracts['greatCoin'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            evmCode = evmCode.replace(/__IterableAddressMapping________________/g, iterableAddressMappingAddress.substr(2));
            evmCode = evmCode.replace(/__IterableAddressBalanceMapping_________/g, iterableAddressBalanceMappingAddress.substr(2));

            var greatCoinContract = web3.eth.contract(abi);
            var callFinishedOnce = false;

            greatCoinContract.new({
                from: primaryAddress,
                data: evmCode,
                gas: 3141592
            }, function(err, result) {
                if (err) {
                    return done(err);
                } else {
                    greatCoinTransaction = result.transactionHash;
                    if (!callFinishedOnce) {
                        // using contract.new() method triggers the callback function twice
                        // we will limit the call of the done function only once
                        callFinishedOnce = true;
                        done();
                    }
                }
            });
        });

        it('should verify the greatCoin contract transaction immediately (eth_getTransactionReceipt)', function(done) {
            web3.eth.getTransactionReceipt(greatCoinTransaction, function(err, receipt) {
                if (err) {
                    return done(err);
                }

                greatCoinAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(greatCoinAddress, null, 'Transaction did not create a contract');
                done();
            });
        });

        it('should verify there\'s code at the greatCoin contract address (eth_getCode)', function(done) {
            web3.eth.getCode(greatCoinAddress, function(err, result) {
                if (err) {
                    return done(err);
                }
                assert.notEqual(result, null);
                assert.notEqual(result, '0x0');

                // NOTE: We can't test the code returned is correct because the results
                // of getCode() are *supposed* to be different than the code that was
                // added to the chain.

                done();
            });
        });

        it('should create gxDeploymentAdmins contract along with the greatCoin contract', function(done) {
            var greatCoinContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['greatCoin'].interface));
            var greatCoin = greatCoinContract.at(greatCoinAddress);

            greatCoin.deploymentAdmins(function(err, result) {
                gxDeploymentAdminsAddress = result;
                assert.notEqual(gxDeploymentAdminsAddress, null);
                assert.notEqual(gxDeploymentAdminsAddress, '0x');
                done();
            });
        });

        it('should verify there\'s code at the deployment admins address (eth_getCode)', function(done) {
            web3.eth.getCode(gxDeploymentAdminsAddress, function(err, result) {
                if (err) {
                    return done(err);
                }
                assert.notEqual(result, null);
                assert.notEqual(result, '0x');

                done();
            });
        });

        it('should create gxAdmins contract along with the greatCoin contract', function(done) {
            var greatCoinContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['greatCoin'].interface));
            var greatCoin = greatCoinContract.at(greatCoinAddress);

            greatCoin.admins(function(err, result) {
                gxAdminsAddress = result;
                assert.notEqual(gxAdminsAddress, null);
                assert.notEqual(gxAdminsAddress, '0x');
                done();
            });
        });

        it('should verify there\'s code at the gxAdmins address (eth_getCode)', function(done) {
            web3.eth.getCode(gxAdminsAddress, function(err, result) {
                if (err) {
                    return done(err);
                }
                assert.notEqual(result, null);
                assert.notEqual(result, '0x');

                done();
            });
        });

        // These are expected to be run in order.
        var gxTradersTransaction;

        it('should add traders contract to the network (eth_sendTransaction)', function(done) {

            var compiledContract = contractsOutput.contracts['gxTraders'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            evmCode = evmCode.replace(/__IterableAddressMapping________________/g, iterableAddressMappingAddress.substr(2));
            evmCode = evmCode.replace(/__IterableAddressBalanceMapping_________/g, iterableAddressBalanceMappingAddress.substr(2));

            var tradersContract = web3.eth.contract(abi);
            var callFinishedOnce = false;

            tradersContract.new(greatCoinAddress, {
                from: primaryAddress,
                data: evmCode,
                gas: 3141592
            }, function(err, result) {
                if (err) {
                    return done(err);
                } else {
                    gxTradersTransaction = result.transactionHash;
                    if (!callFinishedOnce) {
                        // using contract.new() method triggers the callback function twice
                        // we will limit the call of the done function only once
                        callFinishedOnce = true;
                        done();
                    }
                }
            });
        });

        it('should verify the traders transaction immediately (eth_getTransactionReceipt)', function(done) {
            web3.eth.getTransactionReceipt(gxTradersTransaction, function(err, receipt) {
                if (err) {
                    return done(err);
                }

                gxTradersAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(gxTradersAddress, null, 'Transaction did not create a contract');
                done();
            });
        });

        it('should verify there\'s code at the traders address (eth_getCode)', function(done) {
            web3.eth.getCode(gxTradersAddress, function(err, result) {
                if (err) {
                    return done(err);
                }
                assert.notEqual(result, null);
                assert.notEqual(result, '0x');

                // NOTE: We can't test the code returned is correct because the results
                // of getCode() are *supposed* to be different than the code that was
                // added to the chain.

                done();
            });
        });

        // These are expected to be run in order.
        var gxOrdersTransaction;

        it('should add gxOrders contract to the network (eth_sendTransaction)', function(done) {

            var compiledContract = contractsOutput.contracts['gxOrders'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            var ordersContract = web3.eth.contract(abi);
            var callFinishedOnce = false;

            ordersContract.new(greatCoinAddress, {
                from: primaryAddress,
                data: evmCode,
                gas: 3141592
            }, function(err, result) {
                if (err) {
                    return done(err);
                } else {
                    gxOrdersTransaction = result.transactionHash;
                    if (!callFinishedOnce) {
                        // using contract.new() method triggers the callback function twice
                        // we will limit the call of the done function only once
                        callFinishedOnce = true;
                        done();
                    }
                }
            });
        });

        it('should verify the gxOrders transaction immediately (eth_getTransactionReceipt)', function(done) {
            web3.eth.getTransactionReceipt(gxOrdersTransaction, function(err, receipt) {
                if (err) {
                    return done(err);
                }

                gxOrdersAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(gxOrdersAddress, null, 'Transaction did not create a contract');
                done();
            });
        });

        it('should verify there\'s code at the gxOrders address (eth_getCode)', function(done) {
            web3.eth.getCode(gxOrdersAddress, function(err, result) {
                if (err) {
                    return done(err);
                }
                assert.notEqual(result, null);
                assert.notEqual(result, '0x');

                done();
            });
        });
    });

    const basicAmount = 100;
    const MILLION = 1000000;

    var Order = function(id, quantity, pricePerCoin, userAddress, nextId, gas) {
        this.id = id;
        this.quantity = quantity;
        this.pricePerCoin = pricePerCoin;
        this.userAddress = userAddress;
        this.nextId = typeof nextId !== 'undefined' ? nextId : 0;
        // if gas is not provided, we use 1 million gas
        this.gas = typeof gas !== 'undefined' ? gas : 1000000;
    };

    describe('greatCoin', function(done) {

        var greatCoin;
        var admins;
        var deploymentAdmins;
        var traders;
        var gxOrders;

        before(function(done) {

            var greatCoinContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['greatCoin'].interface));
            greatCoin = greatCoinContract.at(greatCoinAddress);

            greatCoin.addContracts(gxTradersAddress, gxOrdersAddress, {from: primaryAddress}, function(err, results) {
                if (err) {
                    return done(err);
                }
                greatCoin.deploymentAdmins(function(err, result) {
                    var deploymentAdminsContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxDeploymentAdmins'].interface));
                    deploymentAdmins = deploymentAdminsContract.at(result);

                    greatCoin.admins(function(err, result) {
                        var adminsContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxAdmins'].interface));
                        admins = adminsContract.at(result);
                        greatCoin.traders(function(err, result) {
                            var tradersContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxTraders'].interface));
                            traders = tradersContract.at(result);

                            greatCoin.orders(function(err, result) {
                                var gxOrdersContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxOrders'].interface));
                                gxOrders = gxOrdersContract.at(result);
                                done();
                            });
                        });
                    });

                });
            });

            Order.prototype.createBuyOrder = function(after) {
                greatCoin.createBuyOrder(this.quantity, this.pricePerCoin, 0, {from: this.userAddress, gas: this.gas}, function(err, result) {
                    after();
                });
            };

            Order.prototype.createSellOrder = function(after) {
                greatCoin.createSellOrder(this.quantity, this.pricePerCoin, 0, {from: this.userAddress, gas: this.gas}, function(err, result) {
                    after();
                });
            };
        });

        function assertCoinLimit(expectedAmount, done) {
            greatCoin.coinLimit(function(err, result) {
                assert.equal(result, expectedAmount);
                done();
            });
        }

        function createOrders(orders, currIndex, isBuyOrder, after) {
            if (currIndex == orders.length) {
                after();
            } else {
                if (isBuyOrder) {
                    orders[currIndex].createBuyOrder(createNextOrder);
                } else {
                    orders[currIndex].createSellOrder(createNextOrder);
                }
            }

            function createNextOrder() {
                createOrders(orders, currIndex + 1, isBuyOrder, after);
            }
        }

        function verifyOrders(orders, currIndex, isBuyOrder, after) {
            if (currIndex == orders.length) {
                after();
            } else {
                var targetOrder = orders[currIndex];
                getOrder(currIndex + 1, isBuyOrder, function (err, result) {
                    verifyOrder(result, targetOrder);

                    // verify the next one
                    verifyOrders(orders, currIndex + 1, isBuyOrder, after);
                });
            }
        }

        function getOrder(orderId, isBuyOrder, after) {
            if (isBuyOrder) {
                gxOrders.getBuyOrder(orderId, after);
            } else {
                gxOrders.getSellOrder(orderId, after);
            }
        }

        function toOrderObject(orderResult) {
            return {
                orderId: orderResult[0],
                nextId: orderResult[1],
                account: orderResult[2],
                quantity: orderResult[3],
                pricePerCoin: orderResult[4],
                originalQuantity: orderResult[5],
                expirationTime: orderResult[6]
            }
        }

        function verifyOrder(orderResult, expectedOrder) {
            var order = toOrderObject(orderResult);
            assert.equal(order.orderId, expectedOrder.id);
            assert.equal(order.nextId, expectedOrder.nextId);
            assert.equal(order.account, expectedOrder.userAddress);
            assert.equal(order.quantity, expectedOrder.quantity);
            assert.equal(order.pricePerCoin, expectedOrder.pricePerCoin);
        }

        function toOrderSummary(orderSummary) {
            return {
                firstId: orderSummary[0],
                count: orderSummary[1],
                maxId: orderSummary[2],
            }
        }

        function verifyOrderSummary(result, expectedResult) {
            var summary = toOrderSummary(result);
            assert.equal(summary.firstId, expectedResult.firstId);
            assert.equal(summary.count, expectedResult.count);
            assert.equal(summary.maxId, expectedResult.maxId);
        }

        it('should add the deploying address to deployment admin collection', function(done) {
            deploymentAdmins.contains(accounts[0], function(err, result) {
                if (err) {
                    done(err);
                } else {
                    assert.equal(true, result);
                    done();
                }
            });
        });

        it('should allow deployment admins to add other deployment admins', function(done) {
            deploymentAdmins.add(accounts[1], {from: accounts[0]}, function(err, result) {
                deploymentAdmins.contains(accounts[1], function(err, result) {
                    assert.equal(true, result);
                    done();
                });
            });
        });

        it('should allow deployment admins to remove other deployment admins', function(done) {
            deploymentAdmins.remove(accounts[1], {from: accounts[0]}, function(err, result) {
                deploymentAdmins.contains(accounts[1], function(err, result) {
                    assert.equal(false, result);
                    done();
                });
            });
        });

        it('should not allow deployment admins to remove themselves', function(done) {
            deploymentAdmins.remove(accounts[0], {from: accounts[0]}, function(err, result) {
                deploymentAdmins.contains(accounts[0], function(err, result) {
                    assert.equal(true, result);
                    done();
                });
            });
        });

        it('should not allow non-deployment admins to add deployment admins', function(done) {
            deploymentAdmins.add(accounts[3], {from: accounts[2]}, function(err, result) {
                deploymentAdmins.contains(accounts[3], function(err, result) {
                    assert.equal(false, result);
                    done();
                });
            });
        });

        it('should allow deployment admins to add contract admins', function(done) {
            admins.add(accounts[0], {from: accounts[0]}, function(err, result) {
                admins.contains(accounts[0], function(err, result) {
                    assert.equal(true, result);
                    admins.add(accounts[1], {from: accounts[0]}, function(err, result) {
                        admins.contains(accounts[1], function(err, result) {
                            assert.equal(true, result);
                            done();
                        });
                    });
                });
            });
        });

        it('should not allow non-deployment admins to add contract admins', function(done) {
            admins.add(accounts[3], {from: accounts[4]}, function(err, result) {
                admins.contains(accounts[3], function(err, result) {
                    assert.equal(false, result);
                    done();
                });
            });
        });

        it('should not allow contract admins to remove themselves', function(done) {
            admins.remove(accounts[1], {from: accounts[1]}, function(err, result) {
                admins.contains(accounts[1], function(err, result) {
                    assert.equal(true, result);
                    done();
                });
            });
        });

        it('should allow deployment admins to remove contract admins', function(done) {
            admins.add(accounts[1], {from: accounts[0]}, function(err, result) {
                admins.contains(accounts[1], function(err, result) {
                    assert.equal(true, result);
                    admins.remove(accounts[1], {from: accounts[0]}, function(err, result) {
                        admins.contains(accounts[1], function(err, result) {
                            assert.equal(false, result);
                            done();
                        });
                    });
                });
            });
        });

        it('default to setting the maximum number of coins to 75 million', function(done) {
            assertCoinLimit(75 * MILLION, done);
        });

        it('should not allow for setting the maximum number of createable coins above 75 million', function(done) {
            greatCoin.setCoinLimit(80 * MILLION, {from: accounts[0]}, function(err, result) {
                assertCoinLimit(75 * MILLION, done);
            });
        });

        it('should allow for setting the maximum number of createable coins', function(done) {
            greatCoin.setCoinLimit(50 * MILLION, {from: accounts[0]}, function(err, result) {
                assertCoinLimit(50 * MILLION, done);
            });
        });

        it('should allow an unregistered trader account to be registered', function(done) {

            greatCoin.unregisterTraderAccount(traderAddress, {from: accounts[0]}, function() {
                traders.contains(traderAddress, function(err, result) {
                    assert.equal(result, false);

                    greatCoin.registerTraderAccount(traderAddress, {from: accounts[0]}, function() {
                        traders.contains(traderAddress, function(err1, result1) {
                            assert.equal(result1, true);
                            // TODO: contract and trader balance does not change until after this test completes so we can't assert that it changed here
                            done();
                        });
                    });
                });
            });
        });

        it('should allow a registered trader account to be unregistered', function(done) {

            greatCoin.registerTraderAccount(traderAddress, {from: accounts[0]}, function() {
                traders.contains(traderAddress, function(err, result) {
                    assert.equal(result, true);

                    greatCoin.unregisterTraderAccount(traderAddress, {from: accounts[0]}, function() {
                        traders.contains(traderAddress, function(err1, result1) {
                            assert.equal(result1, false);
                            done();
                        });
                    });
                });
            });
        });

        it('should not allow GreatCoins to be seeded to non-registered account', function(done) {
            greatCoin.unregisterTraderAccount(accounts[2], {from: accounts[0]}, function() {
                greatCoin.seedCoins(accounts[2], basicAmount, 'some notes', 1, {from: accounts[0]}, function() {
                    traders.coinBalance(accounts[2], function(err, result) {
                        assert.equal(result.toNumber(), 0);
                        done();
                    });
                });
            });
        });

        it('should allow GreatCoins to be seeded to registered account', function(done) {
            greatCoin.registerTraderAccount(accounts[0], {from: accounts[0]}, function() {
                greatCoin.seedCoins(accounts[0], basicAmount, 'some notes', 1, {from: accounts[0]}, function(err, res) {
                    traders.coinBalance(accounts[0], function(err2, result2) {
                        assert.equal(result2, basicAmount);
                        done();
                    });
                });
            });
        });

        it('should not allow seeding coins for null account', function(done) {
            greatCoin.seedCoins(null, basicAmount + 1, 'some notes', 1, {from: accounts[0]}, function() {
                traders.coinBalance(null, function(err, result) {
                    assert.equal(result.toNumber(), 0);
                    done();
                });
            });
        });

        it('should keep track of total number of seeded coins', function(done) {
            greatCoin.totalCoins(function(err, result) {
                assert.equal(result.toNumber(), basicAmount);
                done();
            });
        });

        it('should not allow creation of more coins than coin limit', function(done) {
            greatCoin.seedCoins(accounts[0], 50 * MILLION, 'some notes', 1, {from: accounts[0]}, function() {
                traders.coinBalance(accounts[0], {from: accounts[0]}, function(err, result) {
                    assert.equal(result.toNumber(), basicAmount);

                    greatCoin.totalCoins(function(err, result) {
                        assert.equal(result.toNumber(), basicAmount);
                        done();
                    });

                });
            });
        });

        it('should not allow for creation of buy orders without available funds', function(done) {
            greatCoin.createBuyOrder(1, 1, 0, {from: accounts[0]}, function(err, result) {
                gxOrders.getBuyOrdersInfo(function(err, result) {
                    verifyOrderSummary(result, {firstId: 0, count: 0, maxId: 0});
                    done();
                });
            });
        });

        it('should allow funding of trading account', function(done) {
            greatCoin.fund(accounts[0], 4000000, {from: accounts[0]}, function(err, result) {
                traders.dollarBalance(accounts[0], function(err, result) {
                    assert.equal(result, 4000000);
                    greatCoin.fund(accounts[0], 6000000, {from: accounts[0]}, function(err, result) {
                        traders.dollarBalance(accounts[0], function(err, result) {
                            assert.equal(result, 10000000);
                            done();
                        });
                    });
                });
            });
        });

        it('should not allow for creation of buy orders without trading being open', function(done) {
            greatCoin.setTradingOpen(false, {from: accounts[0]}, function(err, result) {
                greatCoin.createBuyOrder(1, 1, 0, {from: accounts[0]}, function (err, result) {
                    gxOrders.getBuyOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 0, count: 0, maxId: 0});
                        done();
                    });
                });
            });
        });

        it('should not allow creation of buy orders directly with the gxOrders contract', function(done) {
            greatCoin.setTradingOpen(true, {from: primaryAddress}, function(err, result) {
                var buyOrder = new Order(1, 200, 100, primaryAddress);
                gxOrders.createBuyOrder(buyOrder.quantity, buyOrder.pricePerCoin, 0, {from: primaryAddress}, function(err, res) {
                    gxOrders.getBuyOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 0, count: 0, maxId: 0});
                        done();
                    });
                });
            });
        });

        it('should allow creation of buy orders when trading is open', function(done) {
            var buyOrder = new Order(1, 20, 100, primaryAddress);
            buyOrder.createBuyOrder(function(err, res) {
                gxOrders.getBuyOrdersInfo(function(err, result) {
                    verifyOrderSummary(result, {firstId: 1, count: 1, maxId: 1});
                    done();
                });
            });
        });

        // this test is built on top of the previous test
        it('should deduct available funds during creation of buy orders', function(done) {
            traders.dollarBalance(primaryAddress, {from: primaryAddress}, function (err, result) {
                assert.equal(result, 10000000 - (20 * 100));
                done();
            });
        });

        // this test is built on top of the previous test
        it('should allow for iterating though the collection of buy orders', function(done) {
            // order from test above, will be first in ledger
            var o1 = new Order(1, 20, 100, primaryAddress, 4);

            var o2 = new Order(2, 200, 101, primaryAddress, 1);
            var o3 = new Order(3, 20, 102, primaryAddress, 2);
            var o4 = new Order(4, 200, 99, primaryAddress, 0);

            var orders = [o1, o2, o3, o4];
            createOrders(orders, 1, true, function() { // start at index 1, first buyOrder already created
                gxOrders.getBuyOrdersInfo(function(err, result) {
                    verifyOrderSummary(result, {firstId: 3, count: 4, maxId: 4});
                    verifyOrders(orders, 0, true, done);
                });
            });
        });

        // this test is built on top of the previous test
        it('should deduct available funds during creation of additional buy orders', function(done) {
            traders.dollarBalance(primaryAddress, {from: primaryAddress}, function(err, result) {
                // Note: this represents all the buy orders created to now and will be used going forward ...
                assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102) + (200 * 99)));
                done();
            });
        });

        it('Should not allow to cancel buy order by directly using the gxOrders contract', function(done) {
            gxOrders.cancelOrder(4, true, primaryAddress, {from: primaryAddress}, function(err, results) {
                gxOrders.getBuyOrdersInfo(function(err, result) {
                    verifyOrderSummary(result, {firstId: 3, count: 4, maxId: 4});

                    done();
                });
            });
        });

        it('should credit balance after cancelling buy orders', function(done) {
            greatCoin.cancelOrder(4, true, {from: primaryAddress}, function(err, results) {
                traders.dollarBalance(primaryAddress, {from: primaryAddress}, function(err, result) {
                    assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)));

                    gxOrders.getBuyOrder(4, function(err2, buyOrderResults) {
                        // the buy order #4 is no longer present with the returned ID 0
                        assert.equal(toOrderObject(buyOrderResults).orderId, 0);

                        gxOrders.getBuyOrdersInfo(function(err, result) {
                            verifyOrderSummary(result, {firstId: 3, count: 3, maxId: 4});

                            done();
                        });
                    });
                });
            });
        });

        it('should allow for creation of sell orders', function(done) {
            var sellOrder = new Order(1, 1, 1000, primaryAddress);
            sellOrder.createSellOrder(function() {
                verifyOrders([sellOrder], 0, false, done);
            });
        });

        // this test is built on top of the previous test
        it('should allow for iterating though the collection of sales orders', function(done) {
            var originalSellOrder = new Order(1, 1, 1000, primaryAddress, 3);

            var so2 = new Order(2, 2, 1020, primaryAddress, 0);
            var so3 = new Order(3, 3, 1001, primaryAddress, 4);
            var so4 = new Order(4, 3, 1005, primaryAddress, 2);
            var sellOrders = [originalSellOrder, so2, so3, so4];
            createOrders(sellOrders, 1, false, function() { // start at index 1, original sell order already created
                gxOrders.getSellOrdersInfo(function(err, result) {
                    verifyOrderSummary(result, {firstId: 1, count: 4, maxId: 4});

                    verifyOrders(sellOrders, 0, false, done);
                });
            });
        });

        // this test is built on top of the previous test
        it('should deduct coins during creation of sales orders', function(done) {
            traders.coinBalance(primaryAddress, {from: primaryAddress}, function(err, result) {
                assert.equal(result, basicAmount - (1 + 2 + 3 + 3));
                done();
            });
        });

        it('should refund coins if sales orders are cancelled', function(done) {
            greatCoin.cancelOrder(4, false, {from: primaryAddress}, function(err, results) {
                traders.coinBalance(primaryAddress, {from: primaryAddress}, function(err, result) {
                    assert.equal(result, basicAmount - (1 + 2 + 3));

                    gxOrders.getSellOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 1, count: 3, maxId: 4});
                        done();
                    });
                });
            });
        });

        it('should match valid sales orders with buy orders', function(done) {

            greatCoin.registerTraderAccount(traderAddress, {from: primaryAddress}, function() {
                greatCoin.seedCoins(traderAddress, basicAmount, 'some notes', 1, {from: primaryAddress}, function() {
                    traders.coinBalance(traderAddress, function(err2, result2) {
                        assert.equal(result2, basicAmount);

                        var matchedSellOrder = new Order(5, 10, 100, traderAddress);
                        matchedSellOrder.createSellOrder(function(err, res) {

                            traders.coinBalance(traderAddress, function(err2, result2) {
                                assert.equal(result2, basicAmount - 10);

                                gxOrders.getSellOrdersInfo(function(err, result) {
                                    // the maxId of the sell order list is now 5, but the active order count is still 3
                                    verifyOrderSummary(result, {firstId: 1, count: 3, maxId: 5});

                                    gxOrders.getSellOrder(5, function(err1, sellOrderResults) {
                                        assert.equal(toOrderObject(sellOrderResults).orderId, 0); // the sell order is not in the queue

                                        traders.dollarBalance(traderAddress, function(err2, balance) {
                                            assert.equal(balance, 10 * 100);
                                            done();
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should refund available balance if buy pricePerCoin is greater than sales pricePer', function(done) {
            traders.dollarBalance(primaryAddress, function(err, result) {
                //Note: in previous test we matched a sales order for 10 coins at 100 per against a buy order
                //  of 20 coins at 102 per, so 20 must be refunded to available balance
                assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20);

                gxOrders.getBuyOrder(3, function(err2, buyOrderResults) {
                    // orderId, nextId, account, quantity, pricePer
                    verifyOrder(buyOrderResults, new Order(3, 20 - 10, 102, primaryAddress, 2));

                    traders.coinBalance(primaryAddress, function(err2, coin) {
                        assert.equal(coin, basicAmount - (1 + 2 + 3) + 10);
                        done();
                    });
                });
            });
        });

        it('should delete buy orders if fully matched', function(done) {

            var sellOrder = new Order(6, 15, 100, traderAddress);
            sellOrder.createSellOrder(function() {

                gxOrders.getBuyOrdersInfo(function(err1, BuyOrderInfo) {
                    verifyOrderSummary(BuyOrderInfo, {firstId: 2, count: 2, maxId: 4});

                    var buyOrder2 = new Order(2, 200 - 5, 101, primaryAddress, 1);
                    getOrder(2, true, function(err2, buyOrderResult) {
                        verifyOrder(buyOrderResult, buyOrder2);

                        //Note: here we matched a sales order for 15 coins at 100 per against a buy order
                        //  of 10 coins at 102 per and a second buy order of 100 coins at 101 per,
                        // so the buyer should gain 15 coins and 25 must be refunded to available balance
                        traders.coinBalance(primaryAddress, function(err2, coin) {
                            assert.equal(coin, basicAmount - (1 + 2 + 3) + 10 + 15);

                            traders.dollarBalance(primaryAddress, function(err, result) {
                                assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20 + 25);

                                // and the seller should get 15 * 1000 added to the dollar balance
                                traders.dollarBalance(traderAddress, function(err, result) {
                                    assert.equal(result, (10 + 15) * 100);

                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should delete sell orders if fully matched', function(done) {

            var buyOrder = new Order(5, 2, 1001, traderAddress);
            buyOrder.createBuyOrder(function() {
                gxOrders.getSellOrdersInfo(function(err1, SellOrderInfo) {
                    // sell order #1 is now fully matched and deleted
                    verifyOrderSummary(SellOrderInfo, {firstId: 3, count: 2, maxId: 6});

                    var sellOrder3 = new Order(3, 3 - 1, 1001, primaryAddress, 2);
                    getOrder(3, false, function(err2, sellOrderResult) {
                        verifyOrder(sellOrderResult, sellOrder3);

                        //Note: here we matched a buy order for 2 coins at 1001 per against a sell order
                        //  of 1 coins at 1000 per and a second buy order of 2 coins at 1001 per,
                        // so the buyer should gain 2 coins, costing only 1000 + 1001
                        traders.coinBalance(traderAddress, function(err2, coin) {
                            assert.equal(coin, basicAmount - 25 + 2);

                            traders.dollarBalance(primaryAddress, function(err, result) {
                                assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20 + 25 + 1000 + 1001);

                                // check the buyer's dollar balance
                                traders.dollarBalance(traderAddress, function(err, result) {
                                    assert.equal(result, (10 + 15) * 100 - (1000 + 1001));

                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should allow for cancelling of partially fulfilled sell orders and crediting coins', function(done) {
            greatCoin.cancelOrder(3, false, {from: primaryAddress}, function(err, results) {
                traders.coinBalance(primaryAddress, {from: primaryAddress}, function(err, result) {
                    assert.equal(result, basicAmount - (1 + 2 + 3) + 10 + 15 + (3 - 1));

                    gxOrders.getSellOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 2, count: 1, maxId: 6});
                        done();
                    });
                });
            });
        });

        it('should allow for cancelling of partially fulfilled buy orders and getting refund', function(done) {
            greatCoin.cancelOrder(2, true, {from: primaryAddress}, function(err, results) {
                traders.dollarBalance(primaryAddress, {from: primaryAddress}, function(err, result) {
                    assert.equal(result, 10000000 - ((20 * 100) + (200 * 101) + (20 * 102)) + 20 + 25 + 1000 + 1001 + (200 - 5) * 101);
                    gxOrders.getBuyOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 1, count: 1, maxId: 5});
                        done();
                    });
                });
            });
        });

        it('should not allow to cancel sales order created by others or otherwise not present', function(done) {

            var sellOrder = new Order(7, 1, 1000, traderAddress);
            sellOrder.createSellOrder(function() {
                greatCoin.cancelOrder(7, false, {from: primaryAddress}, function (err, results) {

                    gxOrders.getSellOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 7, count: 2, maxId: 7});

                        greatCoin.cancelOrder(7, false, {from: traderAddress}, function (err, results) {

                            gxOrders.getSellOrdersInfo(function(err, result) {
                                verifyOrderSummary(result, {firstId: 2, count: 1, maxId: 7});

                                done();
                            });
                        });
                    });
                });
            });
        });

        it('should not allow to cancel buy order created by others or otherwise not present', function(done) {

            var buyOrder = new Order(6, 1, 105, traderAddress);
            buyOrder.createBuyOrder(function() {
                greatCoin.cancelOrder(6, true, {from: primaryAddress}, function (err, results) {

                    gxOrders.getBuyOrdersInfo(function(err, result) {
                        // the new buy order is still in, i.e., not cancelled
                        verifyOrderSummary(result, {firstId: 6, count: 2, maxId: 6});

                        greatCoin.cancelOrder(6, true, {from: traderAddress}, function (err, results) {

                            gxOrders.getBuyOrdersInfo(function(err, result) {
                                verifyOrderSummary(result, {firstId: 1, count: 1, maxId: 6});

                                done();
                            });
                        });
                    });
                });
            });
        });

        it('Should cancel the remainder of the buy order after partial matches to preventing out-of-gas error', function (done) {

            var buyOrder = new Order(7, 3, 1020, primaryAddress, 0, 250000);
            var sellOrder = new Order(8, 2, 1020, primaryAddress);
            sellOrder.createSellOrder(function(err, res) {
                traders.coinBalance(primaryAddress, function(e,r) {
                    var initialBalance = parseInt(r);
                    buyOrder.createBuyOrder(function(err, res) {
                        gxOrders.getBuyOrdersInfo(function(err, result) {
                            // the first buyOrder ID is still 1, not the higher bid order 7
                            verifyOrderSummary(result, {firstId: 1, count: 1, maxId: 7});

                            // verify that the sell order #1 is matched and there is an remaining sell order #8 that could have matched the buy order
                            gxOrders.getSellOrdersInfo(function(err, result) {
                                verifyOrderSummary(result, {firstId: 8, count: 1, maxId: 8});
                                // check that only 2 is bought
                                traders.coinBalance(primaryAddress, function(e,r) {
                                    assert.equal(r, initialBalance + 2);
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('Should not cancel the remainder of the buy order after partial matches if the sell orders are fully matched', function (done) {

            var buyOrder = new Order(8, 3, 1020, primaryAddress, 0, 250000);
            traders.coinBalance(primaryAddress, function(e,r) {
                var initialBalance = parseInt(r);
                buyOrder.createBuyOrder(function(err, res) {
                    gxOrders.getBuyOrdersInfo(function(err, result) {
                        // the first buyOrder ID is now 8
                        verifyOrderSummary(result, {firstId: 8, count: 2, maxId: 8});

                        // verify that the sell order #8 is matched
                        gxOrders.getSellOrdersInfo(function(err, result) {
                            verifyOrderSummary(result, {firstId: 0, count: 0, maxId: 8});
                            // check that only 2 is bought
                            traders.coinBalance(primaryAddress, function(e,r) {
                                assert.equal(r, initialBalance + 2);
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('Should cancel the remainder of the sell order after partial matches to preventing out-of-gas error', function (done) {

            var sellOrder = new Order(9, 3, 90, primaryAddress, 0, 250000);
            traders.dollarBalance(primaryAddress, function(e, r) {
                var initialBalance = parseInt(r);
                sellOrder.createSellOrder(function(err, res) {
                    gxOrders.getSellOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 0, count: 0, maxId: 9});

                        // verify that the buy order #8 is matched and there is still buyOrder #1
                        gxOrders.getBuyOrdersInfo(function(err, result) {
                            verifyOrderSummary(result, {firstId: 1, count: 1, maxId: 8});
                            traders.dollarBalance(primaryAddress, function(e, r) {
                                // check that the dollar balance, the transaction happens to the same account
                                assert.equal(parseInt(r), initialBalance + 1020);
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('Should not cancel the remainder of the sell order after partial matches if the buy orders are fully matched', function (done) {

            var sellOrder = new Order(10, 30, 90, primaryAddress);
            traders.dollarBalance(primaryAddress, function(e, r) {
                var initialBalance = parseInt(r);
                sellOrder.createSellOrder(function(err, res) {
                    gxOrders.getSellOrdersInfo(function(err, result) {
                        verifyOrderSummary(result, {firstId: 10, count: 1, maxId: 10});

                        // verify that the buy order is matched and there is no outstanding buy orders
                        gxOrders.getBuyOrdersInfo(function(err, result) {
                            verifyOrderSummary(result, {firstId: 0, count: 0, maxId: 8});
                            traders.dollarBalance(primaryAddress, function(e, r) {
                                // check that the dollar balance, the transaction happens to the same account
                                assert.equal(parseInt(r), initialBalance + 20 * 100);
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('should apply refunds as requested by an admin', function(done) {

            traders.dollarBalance(accounts[0], function(err, result) {
                var initialBalance = result;
                greatCoin.fund(accounts[0], -7000000, {from: accounts[0]}, function (err, results) {
                    traders.dollarBalance(accounts[0], function (err, result) {
                        assert.equal(result, initialBalance - 7000000);
                        greatCoin.fund(accounts[0], 7000000 - initialBalance, {from: accounts[0]}, function (err, results) {
                            traders.dollarBalance(accounts[0], {from: accounts[0]}, function (err, result) {
                                assert.equal(result, 0);
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('should return the length of the trader list when requested', function(done) {
            traders.length(function(e,r) {
                assert.equal(r, 3);
                greatCoin.registerTraderAccount(accounts[9], {from: accounts[0]}, function() {
                    traders.length(function(e,r) {
                        assert.equal(r, 4);
                        greatCoin.unregisterTraderAccount(accounts[0], {from: accounts[0]}, function (err, res) {
                            traders.length(function(e,r) {
                                // the traders are stored in an array, and the size of the array
                                assert.equal(r, 4);
                                greatCoin.registerTraderAccount(accounts[0], {from: accounts[0]}, function() {
                                    traders.length(function (e, r) {
                                        assert.equal(r, 5);
                                        done()
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should allow admin user to cancel any pending sell orders', function(done) {
            // set up another trader
            var trader3 = accounts[3];

            greatCoin.registerTraderAccount(trader3, {from: primaryAddress}, function() {
                greatCoin.seedCoins(trader3, basicAmount, 'some notes', 1, {from: primaryAddress}, function() {
                    traders.coinBalance(trader3, function(err, result) {
                        assert(result, basicAmount);

                        var sellOrder = new Order(11, 10, 3000, trader3);
                        sellOrder.createSellOrder(function (err, res) {
                            traders.coinBalance(trader3, function(err2, result) {
                                assert.equal(result, basicAmount - sellOrder.quantity);
                                greatCoin.cancelOrderByAdmin(sellOrder.id, false, {from: primaryAddress}, function(err, res) {
                                    // check that the sell order from trader3 is cancelled
                                    traders.coinBalance(trader3, function(err2, result) {
                                        assert.equal(result, basicAmount);
                                        done();
                                    });
                                });
                            });

                        });
                    });
                });
            });

        });

        it('should allow admin user to cancel any pending buy orders', function(done) {
            // set up another trader
            var trader3 = accounts[3];

            greatCoin.fund(trader3, 100000, {from: primaryAddress}, function (err, results) {
                traders.dollarBalance(trader3, function (err, result) {
                    assert.equal(result, 100000);
                    var buyOrder = new Order(9, 10, 10, trader3);
                    buyOrder.createBuyOrder(function (err, res) {
                        traders.dollarBalance(trader3, function(err2, result) {
                            assert.equal(result, 100000 - buyOrder.quantity * buyOrder.pricePerCoin);

                            greatCoin.cancelOrderByAdmin(buyOrder.id, true, {from: primaryAddress}, function(err, res) {
                                // check that the buy order from trader3 is cancelled
                                traders.dollarBalance(trader3, function(err2, result) {
                                    assert.equal(result, 100000);
                                    done();
                                });
                            });
                        });

                    });
                });
            });
        });

        it('should allow admin user to transfer the balances of one account to another', function(done){
            var trader3 = accounts[3];
            var trader5 = accounts[5];
            greatCoin.totalCoins(function(err, res) {
                var totalCoins = parseInt(res);
                greatCoin.transferTraderBalance(trader3, trader5, {from: primaryAddress}, function (err, res) {
                    traders.dollarBalance(trader5, function (err, result) {
                        assert.equal(result, 100000);
                        traders.coinBalance(trader5, function(err2, result) {
                            assert.equal(result, basicAmount);

                            // check that trader3 is unregistered
                            traders.contains(trader3, function(err, res) {
                                assert.ok(!res);

                                // check that the totalCoins of the contract is unchanged.
                                greatCoin.totalCoins(function(err, res) {
                                    assert.equal(res, totalCoins);
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

    });
};

var logger = {
    log: function(message) {
        console.log(message);
    }
};

describe('Provider:', function() {
    var web3 = new Web3();
    // For additional log messages, logger can be passed to the TestRPC provider:
    // web3.setProvider(TestRPC.provider(logger));
    web3.setProvider(TestRPC.provider(logger));
    tests(web3);
});
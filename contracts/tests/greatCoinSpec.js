/**
 * Created by derek.tiffany on 2/14/16.
 *
 * A simple set of smoke tests which run through a basic scenerio
 */
var Web3 = require('web3');
var fs = require('fs');
var solc = require('solc');
var assert = require('assert');
var TestRPC = require('ethereumjs-testrpc');
var gxCoinAddress;

var optimize = 1;

console.log('Loading solidity contract sources ...');
var contractsSource = fs.readFileSync('contracts/gxCoin.sol').toString();
var librariesSource = fs.readFileSync('contracts/libraries.sol').toString();

console.log('Compiling contracts ...');

var input = {
    'libraries.sol': librariesSource,
    'gxCoin.sol': contractsSource
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

    before(function(done) {
        web3.eth.getAccounts(function(err, accs) {
            if (err) {
                return done(err);
            }

            accounts = accs;
            primaryAddress = accs[0];
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

    var orderListTransaction;
    var orderListAddress;

    describe('library deployment scenerio', function() {
        it('should deploy IterableAddressMapping library', function(done) {
            var compiledContract = contractsOutput.contracts['IterableAddressMapping'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            web3.eth.sendTransaction({
                from: primaryAddress,
                data: evmCode
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
                data: evmCode
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

        it('should deploy OrderList library', function(done) {
            var compiledContract = contractsOutput.contracts['OrderList'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            web3.eth.sendTransaction({
                from: primaryAddress,
                data: evmCode
            }, function(err, result) {
                if (err) {
                    return done(err);
                }
                orderListTransaction = result;
                done();
            });
        });

        it('should verify the OrderList transaction immediately', function(done) {
            web3.eth.getTransactionReceipt(orderListTransaction, function(err, receipt) {
                if (err) {
                    return done(err);
                }

                orderListAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(orderListAddress, null, 'Transaction did not create a contract');
                done();
            });
        });
    });

    describe('contract deployment scenario', function() {

        // These are expected to be run in order.
        var gxCoinTransaction;

        it('should add gxCoin contract to the network (eth_sendTransaction)', function(done) {

            var compiledContract = contractsOutput.contracts['gxCoin'];
            var abi = JSON.parse(compiledContract.interface);
            var evmCode = '0x' + compiledContract.bytecode;

            evmCode = evmCode.replace(/__IterableAddressMapping________________/g, iterableAddressMappingAddress.substr(2));
            evmCode = evmCode.replace(/__IterableAddressBalanceMapping_________/g, iterableAddressBalanceMappingAddress.substr(2));
            evmCode = evmCode.replace(/__OrderList_____________________________/g, orderListAddress.substr(2));

            web3.eth.sendTransaction({
                from: primaryAddress,
                data: evmCode,
                gas: 3141592
            }, function(err, result) {
                if (err) {
                    return done(err);
                }
                gxCoinTransaction = result;
                done();
            });
        });

        it('should verify the transaction immediately (eth_getTransactionReceipt)', function(done) {
            web3.eth.getTransactionReceipt(gxCoinTransaction, function(err, receipt) {
                if (err) {
                    return done(err);
                }

                gxCoinAddress = receipt.contractAddress;

                assert.notEqual(receipt, null, 'Transaction receipt shouldn\'t be null');
                assert.notEqual(gxCoinAddress, null, 'Transaction did not create a contract');
                done();
            });
        });

        it('should verify there\'s code at the address (eth_getCode)', function(done) {
            web3.eth.getCode(gxCoinAddress, function(err, result) {
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
    });

    const basicAmount = 100;
    const MILLION = 1000000;

    var Order = function(quantity, pricePer) {
        this.quantity = quantity;
        this.pricePer = pricePer;
    };

    Order.prototype.createBuyOrder = function(after) {
        gxCoin.createBuyOrder(this.quantity, this.pricePer, function(err, result) {
            after();
        });
    };

    Order.prototype.createSellOrder = function(after) {
        gxCoin.createSellOrder(this.quantity, this.pricePer, function(err, result) {
            after();
        });
    };

    describe('gxCoin', function(done) {

        var gxCoin;
        var admins;
        var deploymentAdmins;
        var traders;

        before(function(done) {
            var gxCoinContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxCoin'].interface));
            gxCoin = gxCoinContract.at(gxCoinAddress);

            gxCoin.deploymentAdmins(function(err, result) {
                var deploymentAdminsContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxDeploymentAdmins'].interface));
                deploymentAdmins = deploymentAdminsContract.at(result);

                gxCoin.admins(function(err, result) {
                    var adminsContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxAdmins'].interface));
                    admins = adminsContract.at(result);
                    gxCoin.traders(function(err, result) {
                        var tradersContract = web3.eth.contract(JSON.parse(contractsOutput.contracts['gxTraders'].interface));
                        traders = tradersContract.at(result);
                        done();
                    });
                });

            });
        });

        function assertCoinLimit(expectedAmount, done) {
            gxCoin.coinLimit(function(err, result) {
                assert.equal(result, expectedAmount);
                done();
            });
        }

        function assertBalance(expectedBalance, done) {
            gxCoin.getBalance(function(err, result) {
                assert.equal(result, expectedBalance);
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
                getOrder(currIndex + 1, isBuyOrder, getOrderCallback);
            }

            function getOrderCallback(result, result) {
                var nextId = (currIndex + 1 == orders.length) ? 0 : currIndex + 2;
                verifyOrder(result, nextId, web3.eth.coinbase, targetOrder.quantity, targetOrder.pricePer);

                // verify the next one
                verifyOrders(orders, currIndex + 1, isBuyOrder, after);
            }
        }

        function getOrder(orderId, isBuyOrder, after) {
            if (isBuyOrder) {
                gxCoin.getBuyOrder(orderId, after);
            } else {
                gxCoin.getSellOrder(orderId, after);
            }
        }

        function verifyMatchedOrder(matchedResult, nextId, salesAcct, buyAcct, quantity, pricePer) {
            assert.equal(matchedResult[0], nextId); //nextById, should now be 2
            assert.equal(matchedResult[1], salesAcct); //sales account
            assert.equal(matchedResult[2], buyAcct); //buy account
            assert.equal(matchedResult[3], quantity); //quantity
            assert.equal(matchedResult[4], pricePer); //pricePer
            //matchedResult[5]  //time
        }

        function verifyOrder(orderResult, nextId, account, quantity, pricePer) {
            assert.equal(orderResult[0], nextId); // nextBuyId
            assert.equal(orderResult[1], account); // account
            assert.equal(orderResult[2], quantity); // quantity
            assert.equal(orderResult[3], pricePer); // pricePer
        }

        it('should add the deploying address to deployment admin collection', function(done) {
            deploymentAdmins.contains(accounts[0], function(err, result) {
                assert.equal(true, result);
                done();
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
            gxCoin.setCoinLimit(80 * MILLION, {from: accounts[0]}, function(err, result) {
                assertCoinLimit(75 * MILLION, done);
            });
        });

        it('should allow for setting the maximum number of createable coins', function(done) {
            gxCoin.setCoinLimit(50 * MILLION, {from: accounts[0]}, function(err, result) {
                assertCoinLimit(50 * MILLION, done);
            });
        });

        it('should allow an unregistered trader account to be registered', function(done) {
            var traderAddress = accounts[2];

            gxCoin.unregisterTraderAccount(traderAddress, {from: accounts[0]}, function() {
                traders.contains(traderAddress, function(err, result) {
                    assert.equal(result, false);

                    gxCoin.registerTraderAccount(traderAddress, {from: accounts[0]}, function() {
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
            var traderAddress = accounts[2];

            gxCoin.registerTraderAccount(traderAddress, {from: accounts[0]}, function() {
                traders.contains(traderAddress, function(err, result) {
                    assert.equal(result, true);

                    gxCoin.unregisterTraderAccount(traderAddress, {from: accounts[0]}, function() {
                        traders.contains(traderAddress, function(err1, result1) {
                            assert.equal(result1, false);
                            done();
                        });
                    });
                });
            });
        });

        it('should not allow GxCoins to be seeded to non-registered account', function(done) {
            gxCoin.unregisterTraderAccount(accounts[2], {from: accounts[0]}, function() {
                gxCoin.seedCoins(accounts[2], basicAmount, 'some notes', 1, {from: accounts[0]}, function() {
                    traders.coinBalance(accounts[2], function(err, result) {
                        assert.equal(result.toNumber(), 0);
                        done();
                    });
                });
            });
        });

        it('should allow gxCoins to be seeded to registered account', function(done) {
            gxCoin.registerTraderAccount(accounts[0], {from: accounts[0]}, function() {
                gxCoin.seedCoins(accounts[0], basicAmount, 'some notes', 1, {from: accounts[0]}, function() {
                    traders.coinBalance(accounts[0], function(err2, result2) {
                        assert.equal(result2, basicAmount);
                        done();
                    });
                });
            });
        });

        it('should not allow seeding coins for null account', function(done) {
            gxCoin.seedCoins(null, basicAmount + 1, 'some notes', 1, {from: accounts[0]}, function() {
                traders.coinBalance(null, function(err, result) {
                    assert.equal(result.toNumber(), 0);
                    done();
                });
            });
        });

        it('should keep track of total number of seeded coins', function(done) {
            gxCoin.totalCoins(function(err, result) {
                assert.equal(result.toNumber(), basicAmount);
                done();
            });
        });

        it('should not allow creation of more coins than coin limit', function(done) {
            gxCoin.seedCoins(accounts[0], 50 * MILLION, 'some notes', 1, {from: accounts[0]}, function() {
                traders.coinBalance(accounts[0], {from: accounts[0]}, function(err, result) {
                    assert.equal(result.toNumber(), basicAmount);

                    gxCoin.totalCoins(function(err, result) {
                        assert.equal(result.toNumber(), basicAmount);
                        done();
                    });

                });
            });
        });

        it.skip('should not allow for creation of buy orders without available funds', function(done) {
            var o = new Order(1, 1);
            o.createBuyOrder(function() {
                gxCoin.getBuyOrdersInfo(function(err, result) {
                    assert.equal(result[0], 0); //firstById
                    assert.equal(result[1], 0); //count
                    done();
                });
            });
        });

        it('should allow funding of trading account', function(done) {
            gxCoin.fund(accounts[0], 4000000, {from: accounts[0]}, function(err, result) {
                traders.dollarBalance(accounts[0], function(err, result) {
                    assert.equal(result, 4000000);
                    gxCoin.fund(accounts[0], 6000000, {from: accounts[0]}, function(err, result) {
                        traders.dollarBalance(accounts[0], function(err, result) {
                            assert.equal(result, 10000000);
                            done();
                        });
                    });
                });
            });
        });

        it.skip('should not allow for creation of buy orders without trading being open', function(done) {
            var o = new Order(1, 1);
            o.createBuyOrder(function() {
                gxCoin.getBuyOrdersInfo(function(err, result) {
                    assert.equal(result[0], 0); //firstById
                    assert.equal(result[1], 0); //count
                    done();
                });
            });
        });

        it.skip('should allow creation of buy orders when trading is open', function(done) {
            gxCoin.setTradingOpen(true, function(err, result) {
                var o = new Order(200, 100);
                o.createBuyOrder(function() {
                    verifyOrders([o], 0, true, done);
                });
            });
        });

        it.skip('should deduct available funds durring creation of buy orders', function(done) {
            gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                assert.equal(result, 10000000 - (200 * 100));
                done();
            });
        });

        it.skip('should allow for iterating though the collection of buy orders', function(done) {
            // order from test above, will be first in ledger
            var originalOrder = new Order(200, 100);

            var o1 = new Order(200, 101);
            var o2 = new Order(200, 102);
            var o3 = new Order(200, 99);
            var orders = [originalOrder, o1, o2, o3];
            createOrders(orders, 1, true, function() { // start at index 1, original order already created
                gxCoin.getBuyOrdersInfo(function(err, result) {
                    assert.equal(result[0], 1); //firstById
                    assert.equal(result[1], 4); //count

                    verifyOrders(orders, 0, true, done);
                });
            });
        });

        it.skip('should deduct available funds durring creation of additional buy orders', function(done) {
            gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                // Note: this represents all the buy orders created to now and will be used going forward ...
                assert.equal(result, 10000000 - ((200 * 100) + (200 * 101) + (200 * 102) + (200 * 99)));
                done();
            });
        });

        it.skip('should allow for creation of sell orders', function(done) {
            var sellOrder = new Order(1, 1000);
            sellOrder.createSellOrder(function() {
                verifyOrders([sellOrder], 0, false, done);
            });
        });

        it.skip('should allow for iterating though the collection of sales orders', function(done) {
            var originalSellOrder = new Order(1, 1000);

            var newSellOrder = new Order(2, 1001);
            var sellOrders = [originalSellOrder, newSellOrder];
            createOrders(sellOrders, 1, false, function() { // start at index 1, original sell order already created
                gxCoin.getSellOrdersInfo(function(err, result) {
                    assert.equal(result[0], 1); //firstById
                    assert.equal(result[1], 2); //count

                    verifyOrders(sellOrders, 0, false, done);
                });
            });
        });

        it.skip('should match valid sales orders with buy orders', function(done) {
            var matchedSellOrder = new Order(10, 100);
            matchedSellOrder.createSellOrder(function() {
                gxCoin.getSellOrdersInfo(function(err, result) {
                    assert.equal(result[0], 1); //firstById
                    assert.equal(result[1], 2); //count should still equal 2 since we matched

                    var sellOrderResults = gxCoin.getSellOrder(2, function(err1, sellOrderResults) {
                        assert.equal(sellOrderResults[0], 0); //nextById, should still be 0
                        assert.equal(sellOrderResults[1], web3.eth.coinbase); //account
                        var buyOrderResults = gxCoin.getBuyOrder(3, function(err2, buyOrderResults) {
                            verifyOrder(buyOrderResults, 4, web3.eth.coinbase, 190, 102);
                            done();
                        });
                    });
                });
            });
        });

        it.skip('should refund available balance if buy pricePer is greater than sales pricePer', function(done) {
            gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                //Note: in previous test we matched a sales order for 10 coins at 100 per against a buy order
                //  of 100 coins at 102 per, so 20 must be refunded to available balance
                assert.equal(result, 10000000 - ((200 * 100) + (200 * 101) + (200 * 102) + (200 * 99)) + 20);
                done();
            });
        });

        it.skip('should delete orders if fully matched', function(done) {
            //TODO: this is one ugly test...find a way to clean this up

            //need to seed additional coins to complete sales order
            gxCoin.seedCoins(web3.eth.coinbase, 200, 'some notes', 1, function(err, result) {
                var sellOrder = new Order(190, 101);
                sellOrder.createSellOrder(function() {
                    gxCoin.getSellOrdersInfo(function(err1, sellOrderInfo) {
                        assert.equal(sellOrderInfo[0], 1); //firstById
                        assert.equal(sellOrderInfo[1], 2); //count should still equal 2 since we matched

                        getOrder(2, false, function(err2, sellOrderResults) {
                            assert.equal(sellOrderResults[0], 0); //nextById, should still be 0 since we did not add a sales order

                            gxCoin.getBuyOrdersInfo(function(err3, buyOrdersInfo) {
                                assert.equal(buyOrdersInfo[0], 1); //firstById
                                assert.equal(buyOrdersInfo[1], 3); //count

                                getOrder(buyOrdersInfo[0], true, function(err3, results1) {
                                    verifyOrder(results1, 2, web3.eth.coinbase, 200, 100);

                                    getOrder(results1[0], true, function(err4, results2) {
                                        verifyOrder(results2, 4, web3.eth.coinbase, 200, 101);

                                        getOrder(results2[0], true, function(err5, results3) {
                                            verifyOrder(results3, 0, web3.eth.coinbase, 200, 99);
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

        it.skip('should refund additional balance if buy pricePer is greater than sales pricePer', function(done) {
            gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                //Note: in previous test we matched a sales order for 190 coins at 101 per against a buy order
                //  of 190 coins at 102 per, so 190 must be refunded to available balance
                assert.equal(result, 10000000 - ((200 * 100) + (200 * 101) + (200 * 102) + (200 * 99)) + 20 + 190);
                done();
            });
        });

        it.skip('should allow for iterating though the collection of matched orders', function(done) {
            gxCoin.getMatchedOrdersInfo(function(err, result) {
                assert.equal(result[0], 1); //firstById
                assert.equal(result[1], 2); //count

                gxCoin.getMatchedOrder(1, function(err1, results1) {
                    verifyMatchedOrder(results1, 2, web3.eth.coinbase, web3.eth.coinbase, 10, 100);

                    gxCoin.getMatchedOrder(results1[0], function(err2, results2) {
                        verifyMatchedOrder(results2, 0, web3.eth.coinbase, web3.eth.coinbase, 190, 101);
                        done();
                    });
                });
            });
        });

        it.skip('should allow for cancelling of unfulfilled orders and crediting coins', function(done) {
            gxCoin.cancelSellOrder(1, function(err, results) {
                gxCoin.cancelBuyOrder(1, function(err1, results1) {
                    assertBalance(98, done);
                });
            });
        });

        it.skip('should refund available funds if buy orders are cancelled', function(done) {
            gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                //Note: in previous test we cancelled out a buy order for 200 coins at 100 per
                assert.equal(result, 10000000 - ((200 * 101) + (200 * 102) + (200 * 99)) + 20 + 190);
                done();
            });
        });

        it.skip('should delete matched orders and credit accounts with coins when matched orders are approved or declined', function(done) {
            gxCoin.approveMatchedOrder(1, function(err, results) {
                gxCoin.declineMatchedOrder(2, function(err1, results1) {
                    gxCoin.getMatchedOrdersInfo(function(err2, result2) {
                        assert.equal(result2[0], 0); //firstById is 0 since all handled
                        assert.equal(result2[1], 0); //count is 0 since all handled

                        //100 (seeded) + 200 (seeded) - 1 (sales order) - 2 (outstanding sales order) + 1 (cancelled sales order)
                        assertBalance(298, done);
                    });
                });
            });
        });

        it.skip('should refund or credit available funds when matched orders are settled', function(done) {
            gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                //Note: in previous test we completely matched or cancelled the buy order for 200 coins at 102, leaving
                assert.equal(result, 10000000 - ((200 * 101) + (200 * 99)));
                done();
            });
        });

        it.skip('should complete refunds for additional cancelled buy orders to original amount', function(done) {
            gxCoin.cancelBuyOrder(2, function(err, results) {
                gxCoin.cancelBuyOrder(4, function(err1, results1) {
                    gxCoin.getAccountBalanceUSD(web3.eth.coinbase, function(err, result) {
                        //Note: cancelling the remaining buy orders should leave us with our original amount ...
                        assert.equal(result, 10000000);
                        done();
                    });
                });
            });
        });

        it('should apply refunds as requested by an admin', function(done) {
            //Note: should currently have a 10000000 balance ...
            gxCoin.fund(accounts[0], -7000000, {from: accounts[0]}, function(err, results) {
                traders.dollarBalance(accounts[0], function(err, result) {
                    assert.equal(result, 3000000);
                    gxCoin.fund(accounts[0], -3000000, {from: accounts[0]}, function(err, results) {
                        traders.dollarBalance(accounts[0], {from: accounts[0]}, function(err, result) {
                            assert.equal(result, 0);
                            done();
                        });
                    });
                });
            });
        });

        it('should not allow adding traders directly via subcontract', function(done) {
            traders.add(accounts[9], {from: accounts[0]}, function(err, results) {
                traders.contains(accounts[9], function(err, result) {
                    assert.equal(result, false);
                    done();
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
    web3.setProvider(TestRPC.provider(logger));
    tests(web3);
});

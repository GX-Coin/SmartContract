import './libraries.sol';
import {greatCoinPrev as gxCoinPrev,
    gxDeploymentAdminsPrev,
    gxAdminsPrev,
    gxTradersPrev} from "./gxCoin_1_0_0.sol";

contract gxContract{
    uint8 public constant versionMajor = 1;
    uint8 public constant versionMinor = 2;
    uint8 public constant versionBuild = 4;

    bool public isEditable = true; // used when upgrade requires multiple transactions

    modifier callableWhenEditable {
        if (isEditable == true) {
            _
        }
    }

    /* Function to recover the funds on the contract */
    function kill();
}

// Applies to all contracts except main greatCoin contract
//   All subContracts of the main greatCoin contract contain a reference to the
//   greatCoin contract and can use it for shared functionality (such as deploymentAdmins)
contract gxSubContract is gxContract {
    greatCoin public greatCoinContract;

    modifier callableByDeploymentAdmin {
        if (isDeploymentAdmin(tx.origin)) {
            _
        }
    }

    modifier callableBySuperContract {
        if (msg.sender == address(greatCoinContract)) {
            _
        }
    }

    function setEditable(bool editable) callableByDeploymentAdmin {
        isEditable = editable;
    }

    function gxSubContract(address greatCoinAddress) {
        greatCoinContract = greatCoin(greatCoinAddress);
    }

    /* Function to recover the funds on the contract */
    function kill() callableByDeploymentAdmin {  suicide(tx.origin); }

    function isDeploymentAdmin(address accountAddress) public constant returns (bool _i) {
        return greatCoinContract.deploymentAdmins().contains(accountAddress);
    }

    function upgradeGreatCoin(greatCoin newGreatCoinContract) public callableByDeploymentAdmin {
        greatCoinContract = newGreatCoinContract;
    }
}


contract gxAccounts is gxSubContract{
    using IterableAddressMapping for IterableAddressMapping.iterableAddressMap;
    IterableAddressMapping.iterableAddressMap addresses;

    //abstract
    function add(address newAddress) public;
    function remove(address removedAddress) public;

    function contains(address lookupAddress) public constant returns (bool _c){
        return addresses.contains(lookupAddress);
    }

    function iterateStart() public constant returns (uint keyIndex) {
        return iterateNext(0);
    }

    function iterateValid(uint keyIndex) public constant returns (bool) {
        return addresses.iterateValid(keyIndex);
    }

    function iterateNext(uint keyIndex) public constant returns (uint r_keyIndex) {
        return addresses.iterateNext(keyIndex);
    }

    function iterateGet(uint keyIndex) public constant returns (address mappedAddress) {
        return addresses.iterateGet(keyIndex);
    }
}

contract gxDeploymentAdmins is gxSubContract, gxAccounts{

    function gxDeploymentAdmins(greatCoin greatCoinAddress) gxSubContract(greatCoinAddress) {
        addresses.add(tx.origin);
        isEditable = true;
    }

    function upgrade(gxDeploymentAdminsPrev gxDeploymentAdminsToUpgrade) callableByDeploymentAdmin public {
        // Deep upgrade, via copying previous data
        uint iterationNumber = gxDeploymentAdminsToUpgrade.iterateStart();
        address iterationCurrent;
        while (gxDeploymentAdminsToUpgrade.iterateValid(iterationNumber)) {
            iterationCurrent = gxDeploymentAdminsToUpgrade.iterateGet(iterationNumber);
            this.add(iterationCurrent);
            iterationNumber++;
        }
    }

    //overridden since we have the list here.
    function isDeploymentAdmin(address accountAddress) public constant returns (bool _i) {
        return addresses.contains(accountAddress);
    }

    function add(address newAddress) callableByDeploymentAdmin public {
        addresses.add(newAddress);
    }

    function remove(address removedAddress) callableByDeploymentAdmin public {
        addresses.remove(removedAddress);
    }
}

contract gxAdmins is gxSubContract, gxAccounts{
    modifier callableByAdmin {
        if (isAdmin(tx.origin)) {
            _
        }
    }

    modifier callableByAdminOrDeploymentAdmin {
        if (isDeploymentAdmin(tx.origin) || (isAdmin(tx.origin))) {
            _
        }
    }

    // required for constructor signature
    function gxAdmins(address greatCoinAddress) gxSubContract(greatCoinAddress) {
        isEditable = true;
    }

    function upgrade(gxAdminsPrev gxAdminsToUpgrade) callableByDeploymentAdmin public {

        // Deep upgrade, via copying previous data
        uint iterationNumber = gxAdminsToUpgrade.iterateStart();
        address iterationCurrent;
        while (gxAdminsToUpgrade.iterateValid(iterationNumber)) {
            iterationCurrent = gxAdminsToUpgrade.iterateGet(iterationNumber);
            this.add(iterationCurrent);
            iterationNumber++;
        }

    }

    function isAdmin(address accountAddress) public constant returns (bool _i) {
        return addresses.contains(accountAddress);
    }

    function add(address newAddress) callableByAdminOrDeploymentAdmin public {
        addresses.add(newAddress);
    }

    function remove(address removedAddress) callableByAdminOrDeploymentAdmin public {
        addresses.remove(removedAddress);
    }
}

contract gxTraders is gxSubContract {
    using IterableAddressBalanceMapping for IterableAddressBalanceMapping.iterableAddressBalanceMap;
    IterableAddressBalanceMapping.iterableAddressBalanceMap traders;
    gxOrders public gxOrdersContract;

    // required for constructor signature
    function gxTraders(greatCoin greatCoinAddress) gxSubContract(greatCoinAddress) {

        isEditable = true;
    }

    function upgrade(gxTradersPrev gxTradersToUpgrade, uint256 keyIndexStart, uint256 keyIndexEnd) callableByDeploymentAdmin public {
        // Deep upgrade, via copying previous data
        uint iterationNumber = gxTradersToUpgrade.iterateStart();
        if (keyIndexStart > iterationNumber) {
            iterationNumber = keyIndexStart;
        }
        address iterationCurrent;
        while (keyIndexEnd >= iterationNumber && gxTradersToUpgrade.iterateValid(iterationNumber)) {
            iterationCurrent = gxTradersToUpgrade.iterateGet(iterationNumber);
            traders.add(iterationCurrent, gxTradersToUpgrade.coinBalance(iterationCurrent), gxTradersToUpgrade.dollarBalance(iterationCurrent));
            iterationNumber++;
        }
    }

    function addOrderContract(address gxOrdersAddress) public callableByDeploymentAdmin {
        gxOrdersContract = gxOrders(gxOrdersAddress);
    }

    modifier callableByAdmin {
        if (greatCoinContract.admins().isAdmin(tx.origin)) {
            _
        }
    }

    modifier callableByGreatCoinOrGxOrders {
        if ((msg.sender == address(greatCoinContract)) || (msg.sender == address(gxOrdersContract))) {
            _
        }
    }

    function add(address newAddress) callableBySuperContract public {
        traders.add(newAddress, 0, 0);
    }

    function remove(address removedAddress) callableBySuperContract public {
        traders.remove(removedAddress);
    }

    function contains(address lookupAddress) public constant returns (bool _c){
        return traders.contains(lookupAddress);
    }

    function iterateStart() public constant returns (uint keyIndex) {
        return iterateNext(0);
    }

    function iterateValid(uint keyIndex) public constant returns (bool) {
        return traders.iterateValid(keyIndex);
    }

    function iterateNext(uint keyIndex) public constant returns (uint r_keyIndex) {
        return traders.iterateNext(keyIndex);
    }

    function iterateGet(uint keyIndex) public constant returns (address mappedAddress) {
        return traders.iterateGet(keyIndex);
    }

    function coinBalance(address mappedAddress) public constant returns (uint32 coinBalance) {
        return traders.valueOfCoinBalance(mappedAddress);
    }

    function dollarBalance(address mappedAddress) public constant returns (int160 dollarBalance) {
        return traders.valueOfDollarBalance(mappedAddress);
    }

    function setCoinBalance(address mappedAddress, uint32 coinBalance) public callableByGreatCoinOrGxOrders {
        traders.setCoinBalance(mappedAddress, coinBalance);
    }

    function setDollarBalance(address mappedAddress, int160 dollarBalance) public callableByGreatCoinOrGxOrders {
        traders.setDollarBalance(mappedAddress, dollarBalance);
    }

    function addCoinAmount(address mappedAddress, uint32 coinAmount) public callableByGreatCoinOrGxOrders {
        traders.addCoinAmount(mappedAddress, coinAmount);
    }

    function addDollarAmount(address mappedAddress, int160 dollarAmount) public callableByGreatCoinOrGxOrders {
        traders.addDollarAmount(mappedAddress, dollarAmount);
    }

    function length() public constant returns (uint) {
        // get the length of the trader list to help with next contract upgrade
        return traders.length();
    }
}

// Sub contract to store all the active buy/sell order and logic to do order matching
contract gxOrders is gxSubContract {
    gxTraders public traders;
    // this field is to assist the deep data copy from the earlier gxOrders contract
    uint80 public nextOrderToCopy;

    // required for constructor signature
    function gxOrders(address greatCoinAddress) gxSubContract(greatCoinAddress) {
        isEditable = true;
    }

    function addTraderContract(address tradersAddress) callableByDeploymentAdmin public {
        traders = gxTraders(tradersAddress);
    }

    // functions used to copy pending order list from a prior contract
    function copyActiveBuyOrders(gxOrders gxOrdersToUpgrade, uint80 startingOrderId, uint80 numberOfOrdersToCopy) callableByDeploymentAdmin public {
        if (buyOrders.count == 0) {
            var (firstId, count, maxId) = gxOrdersToUpgrade.getBuyOrdersInfo();
            if (firstId != startingOrderId) {
                // make sure that the buy order list is initialized correctly
                return;
            }
            buyOrders.firstByPrice = firstId;
            buyOrders.count = count;
            buyOrders.maxId = maxId;
        }

        while (numberOfOrdersToCopy > 0 && startingOrderId > 0) {
            var (orderId, nextByPrice, account, quantity, pricePerCoin, originalQuantity, expirationTime) = gxOrdersToUpgrade.getBuyOrder(startingOrderId);
            if (orderId > 0) {
                Order memory order = Order({
                    orderId: orderId,
                    account: account,
                    quantity: quantity,
                    originalQuantity: originalQuantity,
                    pricePerCoin: pricePerCoin,
                    expirationTime: expirationTime,
                    nextByPrice: nextByPrice
                });
                buyOrders.orders[orderId] = order;
                numberOfOrdersToCopy--;
                startingOrderId = nextByPrice;
            } else {
                break;
            }
        }
        nextOrderToCopy = nextByPrice;
    }

    function copyActiveSellOrders(gxOrders gxOrdersToUpgrade, uint80 startingOrderId, uint80 numberOfOrdersToCopy) callableByDeploymentAdmin public {
        if (sellOrders.count == 0) {
            var (firstId, count, maxId) = gxOrdersToUpgrade.getSellOrdersInfo();
            if (firstId != startingOrderId) {
                // make sure that the sell order list is initialized correctly
                return;
            }
            sellOrders.firstByPrice = firstId;
            sellOrders.count = count;
            sellOrders.maxId = maxId;
        }

        while (numberOfOrdersToCopy > 0 && startingOrderId > 0) {
            var (orderId, nextByPrice, account, quantity, pricePerCoin, originalQuantity, expirationTime) = gxOrdersToUpgrade.getSellOrder(startingOrderId);
            if (orderId > 0) {
                Order memory order = Order({
                    orderId: orderId,
                    account: account,
                    quantity: quantity,
                    originalQuantity: originalQuantity,
                    pricePerCoin: pricePerCoin,
                    expirationTime: expirationTime,
                    nextByPrice: nextByPrice
                });
                sellOrders.orders[orderId] = order;
                numberOfOrdersToCopy--;
                startingOrderId = nextByPrice;
            } else {
                break;
            }
        }
        nextOrderToCopy = nextByPrice;
    }

    // Datatype to store an order as a node on a singly-linked list, storing the next order ID
    struct Order {
        uint80 orderId;
        address account;
        uint32 quantity;
        uint32 originalQuantity;
        uint32 pricePerCoin;
        uint expirationTime;

        uint80 nextByPrice;
    }

    struct Orders {
        uint80 firstByPrice;
        uint80 count;
        uint80 maxId;
        mapping (uint80 => Order) orders;
    }

    // a singly-linked list with price in descending order so that a higher bid is matched first and removed or quantity reduced
    Orders public buyOrders;
    // a singly-linked list with price in ascending order so that a lower ask is matched first and removed or quantity reduced
    Orders public sellOrders;

    function cancelOrder(uint80 orderId, bool isBuy, address owner) callableBySuperContract {
        // protected by and called from the greatCoin parent contract,
        // the argument 'owner' is either the order creator, or 0 if called by an admin
        if (isBuy) {
            Order memory buyOrder = buyOrders.orders[orderId];
            if (buyOrder.orderId != 0 && (buyOrder.account == owner || owner == 0)) {
                removeBuyOrder(buyOrder);
            }
        } else {
            Order memory sellOrder = sellOrders.orders[orderId];
            if (sellOrder.orderId != 0 && (sellOrder.account == owner || owner == 0)) {
                removeSellOrder(sellOrder);
            }
        }
    }

    function removeSellOrder(Order sellOrder) private {
        uint32 coinBalance = traders.coinBalance(sellOrder.account) + sellOrder.quantity;
        traders.setCoinBalance(sellOrder.account, coinBalance);
        greatCoinContract.raiseOrderCancelled(sellOrder.account, sellOrder.quantity, sellOrder.pricePerCoin, sellOrder.orderId,
            sellOrder.originalQuantity, coinBalance, traders.dollarBalance(sellOrder.account), false);
        deleteOrder(sellOrders, sellOrder.orderId);
    }

    function removeBuyOrder(Order buyOrder) private {
        int160 dollarBalance = traders.dollarBalance(buyOrder.account) + (buyOrder.quantity * buyOrder.pricePerCoin);
        traders.setDollarBalance(buyOrder.account, dollarBalance);
        greatCoinContract.raiseOrderCancelled(buyOrder.account, buyOrder.quantity, buyOrder.pricePerCoin, buyOrder.orderId,
            buyOrder.originalQuantity, traders.coinBalance(buyOrder.account), dollarBalance, true);
        deleteOrder(buyOrders, buyOrder.orderId);
    }

    // Question: If pricePerCoin = 0, should these be treated as a market order?  Or should market
    //  orders have their own method?
    function createSellOrder(uint32 quantity, uint32 pricePerCoin, uint whenToExpire) public callableBySuperContract {

        address account = tx.origin;
        if (quantity > 0 && pricePerCoin > 0 && traders.coinBalance(account) >= quantity) {
            createAndMatchOrder(quantity, pricePerCoin, whenToExpire, account, false);
        }
    }

    function createBuyOrder(uint32 quantity, uint32 pricePerCoin, uint whenToExpire) public callableBySuperContract {

        address account = tx.origin;
        if (quantity > 0 && pricePerCoin > 0 && traders.dollarBalance(account) >= quantity * pricePerCoin) {
            createAndMatchOrder(quantity, pricePerCoin, whenToExpire, account, true);
        }
    }

    // combine the buy and sell logic to reduce the contract size
    function createAndMatchOrder(uint32 quantity, uint32 pricePerCoin, uint whenToExpire, address account, bool isBuy) private {

        if (isBuy) {
            // defining the storage variable before the if block triggers the warning: "Uninitialized storage pointer"
            Orders storage orderList = buyOrders;
        } else {
            orderList = sellOrders;
        }

        orderList.maxId++;
        uint80 orderId = orderList.maxId;

        uint32 coinBalance = traders.coinBalance(account);
        int160 dollarBalance = traders.dollarBalance(account);
        if (isBuy) {
            dollarBalance -= quantity * pricePerCoin;
            traders.setDollarBalance(account, dollarBalance);
        } else {
            coinBalance -= quantity;
            traders.setCoinBalance(account, coinBalance);
        }

            Order memory order = Order({
                orderId: orderId,
                account: account,
                quantity: quantity,
                originalQuantity: quantity,
                pricePerCoin: pricePerCoin,
                expirationTime: whenToExpire,
                nextByPrice: 0
            });

        greatCoinContract.raiseOrderCreated(account, quantity, pricePerCoin, orderId, coinBalance, dollarBalance, isBuy);

        matchOrder(order, isBuy);

        if (order.quantity > 0) {
            // cancel remainder of the order if partially matched with potential matches not finished, or save the order
            if (quantity > order.quantity && (
                    (isBuy && sellOrders.firstByPrice > 0 && sellOrders.orders[sellOrders.firstByPrice].pricePerCoin <= pricePerCoin) ||
                    (!isBuy && buyOrders.firstByPrice > 0 && buyOrders.orders[buyOrders.firstByPrice].pricePerCoin >= pricePerCoin)
                )) {
                dollarBalance = traders.dollarBalance(account);
                coinBalance = traders.coinBalance(account);
                if (isBuy) {
                    dollarBalance += order.quantity * pricePerCoin;
                    traders.setDollarBalance(account, dollarBalance);
                } else {
                    coinBalance += order.quantity;
                    traders.setCoinBalance(account, coinBalance);
                }
                greatCoinContract.raiseOrderCancelled(account, order.quantity, pricePerCoin, orderId,
                        order.originalQuantity, coinBalance, dollarBalance, isBuy);
            } else {
                saveOrder(order, isBuy);
            }
        }
    }

    function matchOrder(Order order, bool isBuy) private {

        if (isBuy) {
            // defining the storage variable before the if block triggers the warning: "Uninitialized storage pointer"
            Orders storage orderList = buyOrders;
            Orders storage matchOrderList = sellOrders;
        } else {
            orderList = sellOrders;
            matchOrderList = buyOrders;
        }

        uint80 _prevOrderByPrice = 0;
        uint80 _nextOrderByPrice = matchOrderList.firstByPrice;
        Order memory matchedOrder;
        uint32 matchedQuantity;

        while (_nextOrderByPrice != 0 && order.quantity > 0 &&
                ((isBuy && sellOrders.orders[_nextOrderByPrice].pricePerCoin <= order.pricePerCoin) ||
                (!isBuy && buyOrders.orders[_nextOrderByPrice].pricePerCoin >= order.pricePerCoin))
               // gas amount 150k is tested and conservatively set, enough to do one match and raise the cancel event; 100k causes out-of-gas error
                && msg.gas > 150000
              ) {

            matchedOrder = matchOrderList.orders[_nextOrderByPrice];
            matchedQuantity = order.quantity;
            if (matchedOrder.quantity <= order.quantity) {
                matchedQuantity = matchedOrder.quantity;
                order.quantity -= matchedOrder.quantity;
                _prevOrderByPrice = _nextOrderByPrice;
                _nextOrderByPrice = matchOrderList.orders[_nextOrderByPrice].nextByPrice;
                delete matchOrderList.orders[_prevOrderByPrice];
                matchOrderList.count--;
            } else {
                order.quantity = 0;
                matchOrderList.orders[_nextOrderByPrice].quantity = matchedOrder.quantity - matchedQuantity;
            }
            matchedOrder.quantity = matchedOrder.quantity - matchedQuantity;

            if (isBuy) {
                raiseOrderMatchEvent(matchedQuantity, matchedOrder, order);
            } else {
                raiseOrderMatchEvent(matchedQuantity, order, matchedOrder);
            }
        }

        matchOrderList.firstByPrice = _nextOrderByPrice;
    }

    function saveOrder(Order order, bool isBuy) private {

        if (isBuy) {
            // defining the storage variable before the if block triggers the warning: "Uninitialized storage pointer"
            Orders storage orderList = buyOrders;
        } else {
            orderList = sellOrders;
        }

        uint80 _prevOrderByPrice = 0;
        uint80 _nextOrderByPrice = orderList.firstByPrice;

        while (_nextOrderByPrice > 0 &&
               ((isBuy && buyOrders.orders[_nextOrderByPrice].pricePerCoin >= order.pricePerCoin ) ||
                (!isBuy && sellOrders.orders[_nextOrderByPrice].pricePerCoin <= order.pricePerCoin ) )
              ) {
            _prevOrderByPrice = _nextOrderByPrice;
            _nextOrderByPrice = orderList.orders[_nextOrderByPrice].nextByPrice;
        }

        order.nextByPrice = _nextOrderByPrice;
        orderList.orders[order.orderId] = order;

        if (_prevOrderByPrice == 0) {
            orderList.firstByPrice = order.orderId;
        } else {
            orderList.orders[_prevOrderByPrice].nextByPrice = order.orderId;
        }

        orderList.count++;
    }

    function raiseOrderMatchEvent(uint32 _matchedQuantity, Order memory _sellOrder, Order memory _buyOrder) private {
        int160 dollarBalance;
        uint32 coinBalance;

        coinBalance = traders.coinBalance(_sellOrder.account);
        dollarBalance = traders.dollarBalance(_sellOrder.account) + (_matchedQuantity * _sellOrder.pricePerCoin);
        if (_sellOrder.account == _buyOrder.account) {
            // if buy and sell happens on the same user, the buy and sell match event should have the same coin/dollar balance
            coinBalance += _matchedQuantity;
            if (_buyOrder.pricePerCoin > _sellOrder.pricePerCoin) {
                // refund the buyer the unused amount
                dollarBalance += (_buyOrder.pricePerCoin - _sellOrder.pricePerCoin) * _matchedQuantity;
            }
            traders.setDollarBalance(_sellOrder.account, dollarBalance);
            traders.setCoinBalance(_sellOrder.account, coinBalance);

            greatCoinContract.raiseSellOrderMatched(_sellOrder.account, _buyOrder.account, _matchedQuantity, _sellOrder.pricePerCoin, _buyOrder.orderId, _sellOrder.orderId,
                            _sellOrder.originalQuantity, _sellOrder.quantity, coinBalance, dollarBalance);
            greatCoinContract.raiseBuyOrderMatched(_sellOrder.account, _buyOrder.account, _matchedQuantity, _sellOrder.pricePerCoin, _buyOrder.orderId, _sellOrder.orderId,
                            _buyOrder.originalQuantity, _buyOrder.quantity, _buyOrder.pricePerCoin, coinBalance, dollarBalance);
        } else {
            // if buy and sell occurs on different accounts, the coin/dollar balance is set for the two accounts separately
            traders.setDollarBalance(_sellOrder.account, dollarBalance);

            greatCoinContract.raiseSellOrderMatched(_sellOrder.account, _buyOrder.account, _matchedQuantity, _sellOrder.pricePerCoin, _buyOrder.orderId, _sellOrder.orderId,
                                _sellOrder.originalQuantity, _sellOrder.quantity, coinBalance, dollarBalance);

            coinBalance = traders.coinBalance(_buyOrder.account) + _matchedQuantity;
            traders.setCoinBalance(_buyOrder.account, coinBalance);
            dollarBalance = traders.dollarBalance(_buyOrder.account);
            if (_buyOrder.pricePerCoin > _sellOrder.pricePerCoin) {
                // refund the buyer the unused amount
                dollarBalance += (_buyOrder.pricePerCoin - _sellOrder.pricePerCoin) * _matchedQuantity;
            }
            traders.setDollarBalance(_buyOrder.account, dollarBalance);

            greatCoinContract.raiseBuyOrderMatched(_sellOrder.account, _buyOrder.account, _matchedQuantity, _sellOrder.pricePerCoin, _buyOrder.orderId, _sellOrder.orderId,
                                _buyOrder.originalQuantity, _buyOrder.quantity, _buyOrder.pricePerCoin, coinBalance, dollarBalance);
        }
    }


    function deleteOrder(Orders storage _orders, uint80 orderId) private {

        uint80 _prevOrderByPrice = 0;
        uint80 _nextOrderByPrice = _orders.firstByPrice;
        while (_nextOrderByPrice != orderId) {
            _prevOrderByPrice = _nextOrderByPrice;
            _nextOrderByPrice = _orders.orders[_nextOrderByPrice].nextByPrice;
        }

        if (_nextOrderByPrice == orderId) {
            if (_prevOrderByPrice == 0) {
                _orders.firstByPrice = _orders.orders[orderId].nextByPrice;
            } else {
                _orders.orders[_prevOrderByPrice].nextByPrice = _orders.orders[orderId].nextByPrice;
            }

            delete _orders.orders[orderId];
            _orders.count = _orders.count - 1;
        }
    }

    function getBuyOrder(uint80 orderId) public constant returns (uint80 _orderId, uint80 nextByPrice, address account, uint32 quantity, uint32 pricePerCoin, uint32 originalQuantity, uint expirationTime) {
        Order memory buyOrder = buyOrders.orders[orderId];
        return (buyOrder.orderId, buyOrder.nextByPrice, buyOrder.account, buyOrder.quantity, buyOrder.pricePerCoin, buyOrder.originalQuantity,buyOrder.expirationTime);
    }

    function getSellOrder(uint80 orderId) public constant returns (uint80 _orderId, uint80 nextByPrice, address account, uint32 quantity, uint32 pricePerCoin, uint32 originalQuantity, uint expirationTime) {
        Order memory sellOrder = sellOrders.orders[orderId];
        return (sellOrder.orderId, sellOrder.nextByPrice, sellOrder.account, sellOrder.quantity, sellOrder.pricePerCoin, sellOrder.originalQuantity, sellOrder.expirationTime);
    }

    function getBuyOrdersInfo() public constant returns (uint80 firstById, uint80 count, uint80 maxId) {
        return (buyOrders.firstByPrice, buyOrders.count, buyOrders.maxId);
    }

    function getSellOrdersInfo() public constant returns (uint80 firstById, uint80 count, uint80 maxId) {
        return (sellOrders.firstByPrice, sellOrders.count, sellOrders.maxId);
    }

}


//Externally available functions which are affected by a modifier (ie, callableByVerifiedTrader or callableByAdmin)
//  should not explicitly execute a return, and should instead allow execution to reach the end of the function call
//  so that additional modifier code is executed.

contract greatCoin is gxContract {
    gxDeploymentAdmins public deploymentAdmins;
    gxAdmins public admins;
    gxTraders public traders;
    gxOrders public orders;

    uint32 public constant maxCoinLimit = 75000000;
    uint32 public coinLimit;
    uint32 public totalCoins;

    bool public isTradingOpen = false;

    event traderRegistered(address to);
    event traderUnregistered(address to);
    event coinsSeeded(address to, int40 amountGXC, uint balanceGXC, uint pricePerCoin);
    event funded(address to, int160 amountUSD, int160 balanceUSD);

    // Order events
    event sellOrderCreated(address to, uint32 amountGXC, uint32 pricePerCoin, uint80 sellOrderId, uint balanceGXC, int160 balanceUSD);
    event sellOrderCancelled(address to, uint amountGXC, uint pricePerCoin, uint sellOrderId, uint originalAmountGXC, uint balanceGXC, int160 balanceUSD);
    event sellOrderMatched(address to, address from, uint amountGXC, uint pricePerCoin, uint buyOrderId, uint sellOrderId,
                    uint originalAmountGXC, uint unmatchedAmountGXC, uint balanceGXC, int160 balanceUSD);

    event buyOrderCreated(address to, uint amountGXC, uint pricePerCoin, uint buyOrderId, uint balanceGXC, int160 balanceUSD);
    event buyOrderCancelled(address to, uint amountGXC, uint pricePerCoin, uint buyOrderId, uint originalAmountGXC, uint balanceGXC, int160 balanceUSD);
    event buyOrderMatched(address to, address from, uint amountGXC, uint pricePerCoin, uint buyOrderId, uint sellOrderId,
                    uint originalAmountGXC, uint unmatchedAmountGXC, uint originalPricePerCoin, uint balanceGXC, int160 balanceUSD);


    function raiseOrderCreated(address account, uint32 amount, uint32 pricePerCoin, uint80 orderId, uint balanceGXC, int160 balanceUSD, bool isBuy) callableByOrderContract {
        if (isBuy) {
            buyOrderCreated(account, amount, pricePerCoin, orderId, balanceGXC, balanceUSD);
        } else {
            sellOrderCreated(account, amount, pricePerCoin, orderId, balanceGXC, balanceUSD);
        }
    }

    function raiseSellOrderMatched(address seller, address buyer, uint matchedAmount, uint pricePerCoin, uint buyOrderId, uint sellOrderId,
                         uint originalAmount, uint unmatchedAmount, uint balanceGXC, int160 balanceUSD) callableByOrderContract {
        sellOrderMatched(seller, buyer, matchedAmount, pricePerCoin, buyOrderId, sellOrderId,
                         originalAmount, unmatchedAmount, balanceGXC, balanceUSD);
    }

    function raiseOrderCancelled(address account, uint amount, uint pricePerCoin, uint orderId, uint originalAmount, uint balanceGXC, int160 balanceUSD, bool isBuy) callableByOrderContract {
        if (isBuy) {
            buyOrderCancelled(account, amount, pricePerCoin, orderId, originalAmount, balanceGXC, balanceUSD);
        } else {
            sellOrderCancelled(account, amount, pricePerCoin, orderId, originalAmount, balanceGXC, balanceUSD);
        }
    }

    function raiseBuyOrderMatched(address seller, address buyer, uint matchedAmount, uint pricePerCoin, uint buyOrderId, uint sellOrderId,
                  uint originalAmount, uint unmatchedAmount, uint originalPricePerCoin, uint balanceGXC, int160 balanceUSD) callableByOrderContract {
        buyOrderMatched(buyer, seller, matchedAmount, pricePerCoin, buyOrderId, sellOrderId,
                    originalAmount, unmatchedAmount, originalPricePerCoin, balanceGXC, balanceUSD);
    }


    event verifiedTraderCall(uint refund);

    modifier callableByOrderContract {
        if (msg.sender == address(orders)) {
            _
        }
    }

    modifier callableByTrader {
        uint initialGas = msg.gas;
        if (traders.contains(msg.sender)) {
            if (isTradingOpen) {
                _
            }

            //modify refund by fixed and additional costs
            // the constant represents a lower-end estimation of the execution costs
            // for the remainder of execution.  Note that this should never result in
            // a refund greater than execution costs (or else a trader could run an
            // attack which could successfully drain all contract funds)
            uint refund = tx.gasprice * (initialGas - msg.gas + 29540);
            verifiedTraderCall(refund);
            msg.sender.send(refund);
        } else {
            //verifiedTraderAttempt();
        }
    }


    modifier callableByAdmin {
        if (admins.isAdmin(tx.origin)) {
            _
        }
    }

    modifier callableByDeploymentAdmin {
        if (deploymentAdmins.isDeploymentAdmin(tx.origin)) {
            _
        }
    }

    function greatCoin() {
        // initiate the gxDelopymentAdmins and gxAdmins contract
        // We cannot initiate gxTraders and gxOrders from here. Otherwise, we will get this error "The contract code couldn't be stored, please check your gas amount".
        deploymentAdmins = new gxDeploymentAdmins(this);
        admins = new gxAdmins(this);

        isEditable = true;
        coinLimit = maxCoinLimit;
    }

    function addContracts(address gxTradersAddress, address gxOrdersAddress) callableByDeploymentAdmin public {

        traders = gxTraders(gxTradersAddress);
        orders = gxOrders(gxOrdersAddress);
        traders.addOrderContract(orders);
        orders.addTraderContract(traders);
    }

    /* Function to recover the funds on the contract */
    function kill() callableByDeploymentAdmin {  suicide(tx.origin); }

    function setEditable(bool editable) callableByDeploymentAdmin {
        isEditable = editable;
    }

    // Register a new account for trading and send some ether to the account
    function registerTraderAccount(address traderAccount) callableWhenEditable callableByAdmin {
        if (!traders.contains(traderAccount)) {
            traders.add(traderAccount);

            // send enough Ether to the trader for them to start trading
            // "enough" is calculated as follows:
            //   gas costs per transaction in wei (measured on a local blockchain)
            //     buy: 178839
            //     sell: 159308
            //     sell + match: 217927
            //     cancel: 38665
            //   assume 200000 per transaction * 5 transactions = 1000000 gas
            //   1000000 gas * 50000000000 (current gas price in wei) = 50000000000000000 wei
            traderAccount.send(50000000000000000);
            traderRegistered(traderAccount);
        }
    }

    // Unregister a trader account
    function unregisterTraderAccount(address traderAccount) callableWhenEditable callableByAdmin {
        traders.remove(traderAccount);
        traderUnregistered(traderAccount);
    }

    function setTradingOpen(bool isOpen) callableWhenEditable callableByAdmin {
        isTradingOpen = isOpen;
    }

    function setCoinLimit(uint32 limit) callableWhenEditable callableByAdmin {
        if (limit > 0 && limit <= maxCoinLimit ) {
            coinLimit = limit;
        }
    }

    //Create coins for an existing account.
    //pricePerCoin - Price Per Coin in cents
    function seedCoins(address receiver, uint32 amount, string notes, uint pricePerCoin) callableWhenEditable callableByAdmin {
        if ((coinLimit > 0)
            && (totalCoins + amount <= coinLimit)
            && (receiver != 0)
            && (traders.contains(receiver))) {

            traders.addCoinAmount(receiver, amount);
            totalCoins += amount;
            coinsSeeded(receiver, amount, traders.coinBalance(receiver), pricePerCoin);
        }
    }

    function fund(address receiver, int160 amount) callableWhenEditable callableByAdmin {
        traders.addDollarAmount(receiver, amount);
        funded(receiver, amount, traders.dollarBalance(receiver));
    }

    function cancelOrder(uint80 orderId, bool isBuy) callableByTrader callableWhenEditable {
        orders.cancelOrder(orderId, isBuy, tx.origin);
    }

    // Question: If pricePerCoin = 0, should these be treated as a market order?  Or should market
    //  orders have their own method?
    function createSellOrder(uint32 quantity, uint32 pricePerCoin, uint whenToCancel) callableByTrader callableWhenEditable {
        orders.createSellOrder(quantity, pricePerCoin, whenToCancel);
    }

    function createBuyOrder(uint32 quantity, uint32 pricePerCoin, uint whenToCancel) callableByTrader callableWhenEditable {
        orders.createBuyOrder(quantity, pricePerCoin, whenToCancel);
    }

    function transferTraderBalance(address oldAccount, address newAccount) callableByAdmin callableWhenEditable {
        if (traders.contains(oldAccount) && newAccount != 0) {

            if (!traders.contains(newAccount)) {
                registerTraderAccount(newAccount);
            }

            uint32 coinBalance = traders.coinBalance(oldAccount);
            totalCoins -= coinBalance; // return the coin amount to the pool
            traders.setCoinBalance(oldAccount, 0);
            // Without explicity conversion from uint32 to int40, we will have a large positive number instead of a negative number
            coinsSeeded(oldAccount, -int40(coinBalance), 0, 0);

            seedCoins(newAccount, coinBalance, 'Transfer balance from one account to another', 0);

            int160 dollarBalance = traders.dollarBalance(oldAccount);
            fund(oldAccount, -dollarBalance);
            fund(newAccount, dollarBalance);

            unregisterTraderAccount(oldAccount);

        }
    }

    function cancelOrderByAdmin(uint80 orderId, bool isBuy) callableByAdmin callableWhenEditable {
        orders.cancelOrder(orderId, isBuy, 0);
    }
}

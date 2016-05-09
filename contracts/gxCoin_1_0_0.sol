// Previously deployed (1.0.0) versions of gxCoin contracts

import "./libraries_1_0_0.sol";

contract gxContractPrev{
    uint8 public constant versionMajor = 1;
    uint8 public constant versionMinor = 0;
    uint8 public constant versionBuild = 0;	
	
    /* Function to recover the funds on the contract */
    function kill();
}

// Applies to all contracts except main greatCoin contract
//   All subContracts of the main greatCoin contract contain a reference to the
//   greatCoin contract and can use it for shared functionality (such as deploymentAdmins)
contract gxSubContractPrev is gxContractPrev {
    greatCoinPrev public greatCoinContract;

    modifier callableByDeploymentAdmin {
        if (isDeploymentAdmin(tx.origin)) {
            _
        }
    }
	
    function gxSubContractPrev(greatCoinPrev greatCoinAddress) {
        greatCoinContract = greatCoinAddress;
    }

    /* Function to recover the funds on the contract */
    function kill() callableByDeploymentAdmin {  suicide(tx.origin); }

    function isDeploymentAdmin(address accountAddress) public constant returns (bool _i) {
        return greatCoinContract.deploymentAdmins().contains(accountAddress);
    }
	
    function upgradeGreatCoin(greatCoinPrev newGreatCoinContract) public callableByDeploymentAdmin {
        greatCoinContract = newGreatCoinContract;
    }
}


contract gxAccountsPrev is gxSubContractPrev{
    using IterableAddressMappingPrev for IterableAddressMappingPrev.iterableAddressMap;
    IterableAddressMappingPrev.iterableAddressMap addresses;
	
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

contract gxDeploymentAdminsPrev is gxSubContractPrev, gxAccountsPrev{
		
    function gxDeploymentAdminsPrev(greatCoinPrev greatCoinAddress) gxSubContractPrev(greatCoinAddress) {
        addresses.add(tx.origin);
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

contract gxAdminsPrev is gxSubContractPrev, gxAccountsPrev{
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
    function gxAdminsPrev(greatCoinPrev greatCoinAddress) gxSubContractPrev(greatCoinAddress) {
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

contract gxTradersPrev is gxSubContractPrev {
    using IterableAddressBalanceMappingPrev for IterableAddressBalanceMappingPrev.iterableAddressBalanceMap;
    IterableAddressBalanceMappingPrev.iterableAddressBalanceMap traders;

    // required for constructor signature
    function gxTradersPrev(greatCoinPrev greatCoinAddress) gxSubContractPrev(greatCoinAddress) {
    }	

    modifier callableByAdmin {
        if (greatCoinContract.admins().isAdmin(tx.origin)) {
            _
        }
    }
	
    function add(address newAddress) callableByAdmin public {
        traders.add(newAddress, 0, 0);
    }
	
    function remove(address removedAddress) callableByAdmin public {
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
	
    function setCoinBalance(address mappedAddress, uint32 coinBalance) public callableByAdmin {
        traders.setCoinBalance(mappedAddress, coinBalance);
    }

    function setDollarBalance(address mappedAddress, int160 dollarBalance) public callableByAdmin {
        traders.setDollarBalance(mappedAddress, dollarBalance);
    }
	
    function addCoinAmount(address mappedAddress, uint32 coinAmount) public callableByAdmin {
        traders.addCoinAmount(mappedAddress, coinAmount);
    }

    function addDollarAmount(address mappedAddress, int160 dollarAmount) public callableByAdmin {
        traders.addDollarAmount(mappedAddress, dollarAmount);
    }	
}

// this abbreviated contract is to make sure that the gxOrders contract is compilable
contract gxOrdersPrev is gxSubContractPrev {
    gxTradersPrev public traders;

    function addTraderContract(address tradersAddress) callableByDeploymentAdmin public {
        traders = gxTradersPrev(tradersAddress);
    }

    // Datatype to store an order as a node on a singly-linked list, storing the next order ID
    struct Order {
        uint80 orderId;
        address account;
        uint32 quantity;
        uint32 originalQuantity;
        uint32 pricePerCoin;
        uint placedTime;
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

    function getBuyOrder(uint80 orderId) public constant returns (uint80 _orderId, uint80 nextByPrice, address account, uint32 quantity, uint32 pricePerCoin, uint32 originalQuantity, uint expirationTime) {
        Order memory buyOrder = buyOrders.orders[orderId];
        return (buyOrder.orderId, buyOrder.nextByPrice, buyOrder.account, buyOrder.quantity, buyOrder.pricePerCoin, buyOrder.originalQuantity, buyOrder.expirationTime);
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

contract greatCoinPrev is gxContractPrev {
    gxDeploymentAdminsPrev public deploymentAdmins;
    gxAdminsPrev public admins;
    gxTradersPrev public traders;

    uint32 public constant maxCoinLimit = 75000000;
    uint32 public coinLimit;
    uint32 public totalCoins;

    bool public isTradingOpen = false;	

    // these events should most likely be moved to the traders contract to ensure they are
    //   raised by any call to traders.add or traders.remove
    event traderRegistered(address _account);
    event traderUnregistered(address _account);	
    // these events should most likely be moved to the traders contract, specifically on the
    //   calls that modify coin and dollar balance, to ensure that any time these balances
    //   are updated an event is raised.
    event coinsSeeded(address to, uint amountGXC, uint balanceGXC, uint pricePerCoin);	
    event funded(address to, int160 amountUSD, int160 balanceUSD);	
	
    event sellOrderCreated(address _account, uint amount, uint pricePerCoin, uint orderId, uint placedTime);
    event buyOrderCancelled(address _account, uint amount, uint pricePerCoin, uint orderId);
    event sellOrderCancelled(address _account, uint amount, uint pricePerCoin, uint orderId);	
    event buyOrderCreated(address _account, uint amount, uint pricePerCoin, uint orderId, uint placedTime);	
    event matchedOrderCreated(address salesAccount, address buyAccount, uint amount, uint pricePerCoin, uint orderId, uint buyOrderId, uint sellOrderId, uint matchedTime);
    event matchedOrderApproved(address salesAccount, address buyAccount, uint amount, uint pricePerCoin, uint orderId, uint buyOrderId, uint sellOrderId);
    event matchedOrderDenied(address salesAccount, address buyAccount, uint amount, uint pricePerCoin, uint orderId, uint buyOrderId, uint sellOrderId);		
    //verifiedTraderCall is raised any time a callableByVerifiedTrader function is successfully called by a verifiedTrader
    //  refund - amount of ether (in wei) which was refunded to the verifiedTrader
    event verifiedTraderCall(uint refund);

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
	
    function greatCoinPrev(bool upgrade, address contractToUpgrade) {
        if (upgrade) {

            //shallow upgrade logic
            //deep upgrade if subcontracts change will require iterating
            greatCoinPrev previousContract = greatCoinPrev(contractToUpgrade);
            coinLimit = previousContract.coinLimit();
            totalCoins = previousContract.totalCoins();
            deploymentAdmins = previousContract.deploymentAdmins();
            deploymentAdmins.upgradeGreatCoin(this);
            admins = previousContract.admins();
            admins.upgradeGreatCoin(this);			
            traders = previousContract.traders();
            traders.upgradeGreatCoin(this);			

        } else {

            deploymentAdmins = new gxDeploymentAdminsPrev(this);
            admins = new gxAdminsPrev(this);
            traders = new gxTradersPrev(this);
            coinLimit = maxCoinLimit;
		}
    }

    /* Function to recover the funds on the contract */
    function kill() callableByDeploymentAdmin {  suicide(tx.origin); }	

    // Register a new account for trading and send some ether to the account
    function registerTraderAccount(address traderAccount) callableByAdmin {
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
    function unregisterTraderAccount(address traderAccount) callableByAdmin {
        traders.remove(traderAccount);
        traderUnregistered(traderAccount);
    }

    function setTradingOpen(bool isOpen) callableByAdmin {
        isTradingOpen = isOpen;
    }
	
    function setCoinLimit(uint32 limit) callableByAdmin {
        if (limit > 0 && limit <= maxCoinLimit ) {
            coinLimit = limit;
        }
    }
		
    //Create coins for an existing account.  
    //pricePerCoin - Price Per Coin in cents
    function seedCoins(address receiver, uint32 amount, string notes, uint pricePerCoin) callableByAdmin {
        if ((coinLimit > 0) 
            && (totalCoins + amount <= coinLimit)
            && (receiver != 0)
            && (traders.contains(receiver))) {

            traders.addCoinAmount(receiver, amount);
            totalCoins += amount;
            coinsSeeded(receiver, amount, traders.coinBalance(receiver), pricePerCoin);
        }
    }
	
    function fund(address receiver, int160 amount) callableByAdmin {
        traders.addDollarAmount(receiver, amount);
        funded(receiver, amount, traders.dollarBalance(receiver));
    }
}
import "./libraries.sol";

// Single file which contains all contracts in use

contract gxContract{
    uint8 public constant versionMajor = 1;
    uint8 public constant versionMinor = 0;
    uint8 public constant versionBuild = 0;	
	
    /* Function to recover the funds on the contract */
    function kill();
}

// Applies to all contracts except main gxCoin contract
//   All subContracts of the main gxCoin contract contain a reference to the
//   gxCoin contract and can use it for shared functionality (such as deploymentAdmins)
contract gxSubContract is gxContract {
    gxCoin public gxCoinContract;

    modifier callableBySuperContract {
        if (gxCoinContract == msg.sender) {
            _
        }
    }	
	
    modifier callableByDeploymentAdmin {
        if (isDeploymentAdmin(tx.origin)) {
            _
        }
    }
	
    function gxSubContract(gxCoin gxCoinAddress) {
        gxCoinContract = gxCoinAddress;
    }

    /* Function to recover the funds on the contract */
    function kill() callableByDeploymentAdmin {  suicide(tx.origin); }

    function isDeploymentAdmin(address accountAddress) public constant returns (bool _i) {
        return gxCoinContract.deploymentAdmins().contains(accountAddress);
    }
	
    function upgradeGxCoin(gxCoin newGxCoinContract) public callableByDeploymentAdmin {
        gxCoinContract = newGxCoinContract;
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
		
    function gxDeploymentAdmins(gxCoin gxCoinAddress) gxSubContract(gxCoinAddress) {
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
    function gxAdmins(gxCoin gxCoinAddress) gxSubContract(gxCoinAddress) {
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

    // required for constructor signature
    function gxTraders(gxCoin gxCoinAddress) gxSubContract(gxCoinAddress) {
    }	

    modifier callableByAdmin {
        if (gxCoinContract.admins().isAdmin(tx.origin)) {
            _
        }
    }
	
    function add(address newAddress) callableByAdmin callableBySuperContract public {
        traders.add(newAddress, 0, 0);
    }
	
    function remove(address removedAddress) callableByAdmin callableBySuperContract public {
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

//Externally available functions which are affected by a modifier (ie, callableByVerifiedTrader or callableByAdmin)
//  should not explicitly execute a return, and should instead allow execution to reach the end of the function call
//  so that additional modifier code is executed.

contract gxCoin is gxContract {
    gxDeploymentAdmins public deploymentAdmins;	
    gxAdmins public admins;	
    gxTraders public traders;	

    uint32 public constant maxCoinLimit = 75000000;
    uint32 public coinLimit;
    uint32 public totalCoins;

    bool public isTradingOpen = false;	

    // these events may be moved to a gxSubcontract
    event traderRegistered(address _account);
    event traderUnregistered(address _account);	
    event coinsSeeded(address to, uint amountGXC, uint balanceGXC, uint pricePerCoin);	
    event funded(address to, int160 amountUSD, int160 balanceUSD);	
	
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

    function gxCoin(bool upgrade, address contractToUpgrade) {
        if (upgrade) {

            //shallow upgrade logic (re-uses existing deployed gxSubcontracts)
            //deep upgrade if subcontracts change will require iterating
            gxCoin previousContract = gxCoin(contractToUpgrade);
            coinLimit = previousContract.coinLimit();
            totalCoins = previousContract.totalCoins();
            deploymentAdmins = previousContract.deploymentAdmins();
            deploymentAdmins.upgradeGxCoin(this);
            admins = previousContract.admins();
            admins.upgradeGxCoin(this);
            traders = previousContract.traders();
            traders.upgradeGxCoin(this);

        } else {

            deploymentAdmins = new gxDeploymentAdmins(this);		
            admins = new gxAdmins(this);
            traders = new gxTraders(this);
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
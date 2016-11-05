'use strict';

var fs = require('fs');
const path = require('path');
var solc = require('solc');
var _ = require('underscore');
var importRegex = /import ['"]([^'"]+)['"]/g;

module.exports = {
    CONTRACT_EXTENSION: '.sol',

    /**
     *
     * @param fileNames
     * @param optimize
     * @param [folder]
     * @returns {*}
     */
    compile(fileNames, optimize, folder) {
        if (!_.isArray(fileNames)) {
            fileNames = [fileNames];
        }

        if (_.isUndefined(folder)) {
            folder = '';
        }

        this.log('Loading solidity contract sources ...');
        var sources = {};
        _.each(fileNames, fileName => {
            if (!fileName.endsWith(this.CONTRACT_EXTENSION)) {
                fileName = fileName + this.CONTRACT_EXTENSION;
            }

            this.loadContractSourceFile(fileName, folder, sources);
        });

        this.log('Compiling contracts ...');
        var contractsOutput = solc.compile({sources: sources}, optimize);

        if (contractsOutput.errors) {
            this.log('Compilation errors! See below:');
            _.each(contractsOutput.errors, error => {
                this.log(error);
            });
        }

        return contractsOutput;
    },

    loadContractSourceFile(fileSrc, folder, sources) {
        var fileName = path.basename(fileSrc);
        var filePath = path.join(folder, path.dirname(fileSrc));

        if (sources[fileName]) {
            // file already loaded
            return;
        }

        var sourceFile = path.join(filePath, fileName);

        this.log('Loading ' + fileName + ' from ' + sourceFile);

        var file = fs.readFileSync(sourceFile);
        if (!file) {
            throw new Error('cannot load file ' + sourceFile);
        }

        var source = file.toString();

        var imports = [];
        var importRegexResults;
        while ((importRegexResults = importRegex.exec(source)) !== null) {
            imports.push(importRegexResults[1]);
        }

        _.each(imports, importFileSrc => {
            var importFileName = path.basename(importFileSrc);
            var importFilePath = path.join(filePath, path.dirname(importFileSrc));
            this.loadContractSourceFile(importFileName, importFilePath, sources);
        });

        sources[fileName] = source;
    },

    /**
     *
     * @param {{eth: {contract: Function}}} web3
     * @param solcOutput
     * @param contractClass
     * @param {string} [contractName]
     * @returns {{
     *   name: string,
     *   interface: string,
     *   abi: object,
     *   bytecode: string,
     *   address: string,
     *   transaction: string,
     *   contract: object,
     *   definition: {at: Function}
     * }}
     */
    buildContractFromSolcOutput(web3, solcOutput, contractClass, contractName) {
        if (!contractName) {
            contractName = contractClass;
        }

        var output = solcOutput.contracts[contractClass];
        if (!output) {
            throw new Error('solc output does not have a contract named ' + contractClass);
        }

        var _interface = output.interface.trim();
        var abi = JSON.parse(_interface);

        var bytecode = output.bytecode;

        //noinspection JSValidateTypes
        return {
            name: contractName,
            interface: _interface,
            abi: abi,
            definition: web3.eth.contract(abi),
            bytecode: '0x' + bytecode,
            address: null,
            transaction: null,
            block: null,
            contract: null
        };
    },

    log(/*arguments*/) {
        console.log.apply(this, arguments);
    }
};
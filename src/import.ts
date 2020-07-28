import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import WebUtils from 'web3-utils';
import {
  Result,
  get,
  getEtherscanApiUrl,
  getEtherscanUrl
} from './api';
import { BuildFile, Metadata } from './contract';

interface EtherscanSource {
  SourceCode: string,
  ABI: string,
  ContractName: string,
  CompilerVersion: string,
  OptimizationUsed: string,
  Runs: string,
  ConstructorArguments: string,
  Library: string,
  LicenseType: string,
  SwarmSource: string
}

export async function getEtherscanApiData(network: string, address: string, apikey: string) {
  let apiUrl = await getEtherscanApiUrl(network);
  let result: Result = <Result>await get(apiUrl, { module: 'contract', action: 'getsourcecode', address, apikey });

  if (result.status !== '1') {
    throw new Error(`Etherscan Error: ${result.message} ${result.result}`);
  }

  let s = <EtherscanSource><unknown>result.result[0];

  if (s.ABI === "Contract source code not verified") {
    throw new Error("Contract source code not verified");
  }

  return {
    source: s.SourceCode,
    abi: JSON.parse(s.ABI),
    contract: s.ContractName,
    compiler: s.CompilerVersion,
    optimized: s.OptimizationUsed !== '0',
    optimzationRuns: Number(s.Runs),
    constructorArgs: s.ConstructorArguments
  };
}

async function getContractCreationCode(network: string, address: string, constructorArgs: string) {
  let url = `${await getEtherscanUrl(network)}/address/${address}#code`;
  let result = <string>await get(url, {}, null);
  let verifiedBytecodeRegex = /<div id='verifiedbytecode2'>[\s\r\n]*([0-9a-fA-F]*)[\s\r\n]*<\/div>/g;
  let verifiedByteCodeMatches = [...result.matchAll(verifiedBytecodeRegex)];
  if (verifiedByteCodeMatches.length === 0) {
    throw new Error('Failed to pull deployed contract code from Etherscan');
  }
  let verifiedBytecode = verifiedByteCodeMatches[0][1];
  if (!verifiedBytecode.toLowerCase().endsWith(constructorArgs.toLowerCase())) {
    throw new Error("Expected verified bytecode to end with constructor args, but did not: ${JSON.stringify({verifiedBytecode, constructorArgs})}");
  }

  return verifiedBytecode.slice(0, verifiedBytecode.length - constructorArgs.length);
}

export async function importContract(network: string, address: string | string[], outfile: string, opts_={}) {
  let opts = {
    apikey: "",
    verbose: 0,
    ...opts_
  };

  let addresses = Array.isArray(address) ? address : [address];

  // Okay, this is where the fun begins, let's gather as much information as we can
  let contractBuild = await addresses.reduce(async (acc_, address) => {
    let acc = await acc_;

    let {
      source,
      abi,
      contract,
      compiler,
      optimized,
      optimzationRuns,
      constructorArgs
    } = await getEtherscanApiData(network, address, opts.apikey);

    let contractCreationCode = await getContractCreationCode(network, address, constructorArgs);
    let contractSource = `contracts/${contract}.sol:${contract}`;

    let metadata: Metadata = {
      version: "1",
      language: "Solidity",
      compiler: {
        version: compiler
      },
      sources: {
        [contractSource]: {
          content: source,
          keccak256: WebUtils.keccak256(source)
        }
      },
      settings: {
        remappings: [],
        optimizer: {
          enabled: optimized,
          runs: optimzationRuns
        }, // TODO: Add optimizer `details` section
        metadata: {
          useLiteralContent: false
        },
        compilationTarget: {
          [contractSource]: contract
        },
        libraries: {}
      },
      output: {
        abi,
        userdoc: [],
        devdoc: []
      }
    };

    if (acc.version && compiler !== acc.version) {
      console.warn(`WARN: Contracts differ in compiler version ${acc.version} vs ${compiler}. This makes the build file lightly invalid.`);
    }

    return {
      ...acc,
      contracts: {
        ...acc.contracts,
        [contractSource]: {
          abi: abi,
          bin: contractCreationCode,
          metadata
        }
      },
      version: compiler
    };
  }, Promise.resolve(<BuildFile>{contracts: {}}));

  await util.promisify(fs.writeFile)(outfile, JSON.stringify(contractBuild, null, 2));
}

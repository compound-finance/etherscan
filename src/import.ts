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
import { Metadata } from './contract';

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

async function getEtherscanApiData(network: string, address: string) {
  let apiUrl = await getEtherscanApiUrl(network);
  let result: Result = <Result>await get(apiUrl, { module: 'contract', action: 'getsourcecode', address });

  if (result.status !== '1') {
    throw new Error(`Etherscan Error: ${result.message}`);
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

async function getContractCreationCode(network: string, address: string) {
  let url = `${await getEtherscanUrl(network)}/address/${address}#code`;
  let result = <string>await get(url, {}, null);
  let verifiedBytecodeRegex = /<div id='verifiedbytecode2'>[\s\r\n]*([0-9a-fA-F]*)[\s\r\n]*<\/div>/g;
  let verifiedByteCodeMatches = [...result.matchAll(verifiedBytecodeRegex)];
  if (verifiedByteCodeMatches.length === 0) {
    throw new Error('Failed to pull deployed contract code from Etherscan');
  }
  let verifiedBytecode = verifiedByteCodeMatches[0][1];

  let constructorArgsRegex = /Constructor Arguments.*<pre.*>([0-9a-fA-F]*)<br><br>-----Encoded View---------------/g;
  let constructorArgsMatches = [...result.matchAll(constructorArgsRegex)];
  if (constructorArgsMatches.length === 0) {
    throw new Error('Failed to pull constructor args from Etherscan');
  }
  let constructorArgs = constructorArgsMatches[0][1];

  if (!verifiedBytecode.endsWith(constructorArgs)) {
    throw new Error("Expected verified bytecode to end with constructor args, but did not: ${JSON.stringify({verifiedBytecode, constructorArgs})}");
  }

  return verifiedBytecode.slice(0, verifiedBytecode.length - constructorArgs.length);
}

export async function importContract(network: string, address: string, outdir: string, outname: undefined | string, verbose: number) {
  // Okay, this is where the fun begins, let's gather as much information as we can

  let {
    source,
    abi,
    contract,
    compiler,
    optimized,
    optimzationRuns,
    constructorArgs
  } = await getEtherscanApiData(network, address);
  outname = outname || `${contract}.json`;

  let contractCreationCode = await getContractCreationCode(network, address);
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

  let contractBuild = {
    contracts: {
      [contractSource]: {
        abi: abi,
        bin: contractCreationCode,
        metadata
      }
    },
    version: compiler
  };

  let outfile = path.join(outdir, outname);

  await util.promisify(fs.writeFile)(outfile, JSON.stringify(contractBuild, null, 2));
}

import {
  getEtherscanApiUrl,
  getEtherscanContractUrl,
  get,
  post,
  Result
} from './api';
import {
  ContractJson,
  getMetadata
} from './contract';

export interface VerificationResult {
  verified: boolean
  url: string
  alreadyVerified: boolean
}

async function sleep(timeout: number): Promise<void> {
  return new Promise((resolve, _reject) => {
    setTimeout(() => resolve(), timeout);
  })
}

const importRegex = /^\s*import\s*\"([^\"]+)\"[\s;]*$/mig;
const waitTime = 180000;
const sleepTime = 5000;

// From https://etherscan.io/contract-license-types
const licenses = {
  NO_LICENSE: 1,
  THE_UNLICENSE: 2,
  MIT: 3,
  GPLv2: 4,
  GPLv3: 5,
  LGLPv2_1: 6,
  LGPLv3: 7,
  BSD2: 8,
  BSD3: 9,
  MPL2: 10,
  OSL3: 11,
  APACHE2: 12
};

async function checkStatus(url: string, apiKey: string, token: string, verbose: boolean, remainingWaitTime: number): Promise<void> {
  if (verbose) {
    console.log(`Checking status of ${token}...`);
  }

  // Potential results:
  // { status: '0', message: 'NOTOK', result: 'Fail - Unable to verify' }
  // { status: '0', message: 'NOTOK', result: 'Pending in queue' }
  // { status: '1', message: 'OK', result: 'Pass - Verified' }

  let result = await get<Result>(url, {
    apikey: apiKey,
    guid: token,
    module: "contract",
    action: "checkverifystatus"
  });

  if (verbose) {
    console.log(JSON.stringify(result));
  }

  if (result.result === "Pending in queue" && remainingWaitTime > 0) {
    await sleep(sleepTime);
    return await checkStatus(url, apiKey, token, verbose, remainingWaitTime - sleepTime);
  }

  if (result.result.startsWith('Fail')) {
    throw new Error(`Etherscan failed to verify contract: ${result.message} "${result.result}"`)
  }

  if (Number(result.status) !== 1) {
    throw new Error(`Etherscan Error: ${result.message} "${result.result}"`)
  }

  if (verbose) {
    console.log(`Verification result ${result.result}...`);
  }
}

export async function verifyContract(contractJson: ContractJson, network: string, apiKey: string, address: string, constructorData: string, verbose: boolean): Promise<VerificationResult> {
  let metadata = getMetadata(contractJson);
  let compilerVersion = metadata.compiler.version.replace(/\+commit\.([0-9a-fA-F]+)\..*/gi, '+commit.$1');
  let url = getEtherscanApiUrl(network);
  let language = metadata.language;
  let settings = metadata.settings;
  let sources = metadata.sources;
  let {
    compilationTarget,
    ...restSettings
  } = settings;
  let target = Object.entries(compilationTarget)[0].join(':');

  const verifyData = {
    apikey: apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    codeformat: 'solidity-standard-json-input',
    contractaddress: address,
    sourceCode: JSON.stringify({language, settings: restSettings, sources}),
    contractname: target,
    compilerversion: `v${compilerVersion}`,
    constructorArguements: constructorData,
    licenseType: licenses.NO_LICENSE.toString()
  };

  if (verbose) {
    console.log(`Verifying contract at ${address} with compiler version ${compilerVersion}...`);
  }

  // {"status":"0","message":"NOTOK","result":"Invalid constructor arguments provided. Please verify that they are in ABI-encoded format"}
  // {"status":"1","message":"OK","result":"usjpiyvmxtgwyee59wnycyiet7m3dba4ccdi6acdp8eddlzdde"}

  let alreadyVerified = await doVerify(url, verifyData, apiKey, verbose, waitTime);

  return {
    verified: true,
    url: getEtherscanContractUrl(network, address),
    alreadyVerified
  };
}

async function doVerify(url: string, verifyData: object, apiKey: string, verbose: boolean, remainingWaitTime: number): Promise<boolean> {
  let result = await post<Result>(url, verifyData);

  if (Number(result.status) === 0 || result.message !== "OK") {
    if (result.result.includes('Contract source code already verified')) {
      return true;
    } else if (result.result.includes('Unable to locate ContractCode at') && remainingWaitTime > 0) {
      await sleep(sleepTime);
      return doVerify(url, verifyData, apiKey, verbose, remainingWaitTime - sleepTime);
    } else {
      throw new Error(`Etherscan Error: ${result.message}: ${result.result}`)
    }
  } else {
    await checkStatus(url, apiKey, result.result, verbose, remainingWaitTime);

    return false;
  }
}

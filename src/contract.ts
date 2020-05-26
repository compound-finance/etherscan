
export interface Settings {
  // Required for Solidity: Sorted list of remappings
  remappings: string[]

  // Optional: Optimizer settings. The fields "enabled" and "runs" are deprecated
  // and are only given for backwards-compatibility.
  optimizer: {
    enabled?: boolean,
    runs?: number,
    details?: {
      // peephole defaults to "true"
      peephole: boolean,
      // jumpdestRemover defaults to "true"
      jumpdestRemover: boolean,
      orderLiterals: boolean,
      deduplicate: boolean,
      cse: boolean,
      constantOptimizer: boolean,
      yul: boolean,
      yulDetails: {}
    }
  }
  metadata: {
    // Reflects the setting used in the input json, defaults to false
    useLiteralContent: boolean
    // Reflects the setting used in the input json, defaults to "ipfs"
    bytecodeHash?: string
  }
  // Required for Solidity: File and name of the contract or library this
  // metadata is created for.
  compilationTarget: {
    [file: string]: string
  },
  // Required for Solidity: Addresses for libraries used
  libraries: {
    [library: string]: string
  }
}

export interface Source {
  keccak256: string
  content?: string
  urls?: string[]
}

export interface Output {
  // Required: ABI definition of the contract
  abi: any[],
  // Required: NatSpec user documentation of the contract
  userdoc: any[],
  // Required: NatSpec developer documentation of the contract
  devdoc: any[],
}

export interface Metadata {
  // Required: The version of the metadata format
  version: string
  // Required: Source code language, basically selects a "sub-version"
  // of the specification
  language: string
  compiler: {
    // Required for Solidity: Version of the compiler
    version: string,
    // Optional: Hash of the compiler binary which produced this output
    keccak256?: string
  }
  settings: Settings
  sources: {[filename: string]: Source}
  output: Output
}

export interface ContractJson {
  metadata: string | Metadata
}

export interface BuildFile {
  contracts: {[file: string]: ContractJson}
  version?: string
}

export function getMetadata(contractJson: ContractJson): Metadata {
  if (!contractJson.hasOwnProperty('metadata')) {
    throw new Error(`Verification requires contract JSON with metadata, keys: ${JSON.stringify(Object.keys(contractJson))}`);
  }

  let metadata = contractJson.metadata;

  if (typeof(metadata) === 'string') {
    try {
      return <Metadata>JSON.parse(metadata);
    } catch (e) {
      console.error(`Error parsing contract metadata: ${e.toString()}`);
      console.log(`Metadata Contents\n-----------------\n${metadata}\n-----------------\n`);

      throw e;
    }
  } else if (typeof(metadata) === 'object') {
    return metadata;
  } else {
    throw new Error(`Invalid metadata, expected JSON-string or object, got ${JSON.stringify(metadata)}`);
  }
}

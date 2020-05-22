
export interface Settings {
  compilationTarget: {[file: string]: string}
}

export interface Sources {
  keccak256: string
  contents: string
  urls: string[]
}

export interface Metadata {
  compiler: {version: string}
  language: string
  settings: Settings
  sources: Sources
}

export interface ContractJson {
  metadata: string | Metadata
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

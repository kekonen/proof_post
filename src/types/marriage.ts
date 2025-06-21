export interface ZKPassportProof {
  proof: any;
  publicSignals: string[];
  passportHash: string;
  merkleProof: string[];
  merkleRoot: string;
}

export interface MarriageProposal {
  proposer: string; // zkpassport hash
  proposee: string; // zkpassport hash
  timestamp: number;
  nonce: string;
  signature: string;
}

export interface Marriage {
  id: string;
  spouse1: string; // zkpassport hash
  spouse2: string; // zkpassport hash
  marriageDate: number;
  isActive: boolean;
  merkleRoot: string; // for privacy tree
}

export interface MarriageCertificate {
  marriageId: string;
  proof: any;
  publicSignals: string[];
  merkleProof: string[];
}

export interface NoMarriageProof {
  passportHash: string;
  proof: any;
  publicSignals: string[];
  merkleProof: string[];
  timestamp: number;
}

export interface DivorceRequest {
  marriageId: string;
  requester: string; // zkpassport hash
  timestamp: number;
  signature: string;
}

export enum MarriageStatus {
  SINGLE = 0,
  MARRIED = 1,
  DIVORCED = 2
}
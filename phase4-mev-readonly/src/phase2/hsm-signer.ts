/**
 * Contract only: implement against an organization-managed HSM/KMS signer.
 * The application must never receive/export private key material.
 * Production adapter requirements: authenticated mTLS, signer-side policy,
 * key/slot allowlist, request idempotency, audit IDs, bounded payload size,
 * timeout, response signature verification, and explicit key rotation support.
 */
export interface HsmSigningRequest {
  candidateId: string;
  serializedTransaction: Uint8Array;
  expectedSignerPublicKey: string;
  approvalId: string;
}

export interface HsmSigningResult {
  signedTransaction: Uint8Array;
  signerPublicKey: string;
  auditId: string;
}

export interface HsmSigner {
  sign(request: HsmSigningRequest): Promise<HsmSigningResult>;
}

export function assertHsmResult(
  result: HsmSigningResult,
  expectedPublicKey: string
): void {
  if (result.signerPublicKey !== expectedPublicKey) {
    throw new Error("HSM_SIGNER_IDENTITY_MISMATCH");
  }
  if (result.signedTransaction.length === 0 || !result.auditId.trim()) {
    throw new Error("HSM_RESULT_INVALID");
  }
}

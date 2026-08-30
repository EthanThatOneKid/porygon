import nacl from "tweetnacl";

/**
 * Verify a Discord request signature.
 *
 * @see https://discord.com/developers/docs/interactions/receiving-and.responding#security-and-interaction-payloads
 *
 * @param body      - Raw request body string
 * @param signature - x-signature-ed25519 header
 * @param timestamp - x-signature-timestamp header
 * @param publicKey - Discord application public key (hex string)
 * @returns true if the signature is valid
 */
export function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): boolean {
  try {
    const message = Buffer.from(timestamp + body);
    const signatureBytes = Buffer.from(signature, "hex");
    const publicKeyBytes = Buffer.from(publicKey, "hex");

    return nacl.sign.detached.verify(
      message,
      signatureBytes,
      publicKeyBytes,
    );
  } catch {
    return false;
  }
}

/**
 * Convert a base58 Solana private key to a JSON byte array.
 *
 * Usage: node scripts/key-to-bytes.mjs <base58-private-key>
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const input = process.argv[2];
if (!input) {
    console.error("Usage: node scripts/key-to-bytes.mjs <base58-private-key>");
    process.exit(1);
}

const secretKey = bs58.decode(input);
const kp = Keypair.fromSecretKey(secretKey);

console.log("Public key:", kp.publicKey.toBase58());
console.log("Byte array:", JSON.stringify(Array.from(secretKey)));

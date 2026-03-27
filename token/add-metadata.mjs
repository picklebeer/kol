/**
 * Add Metaplex token metadata to the KOL SPL token on devnet.
 * Usage: node add-metadata.mjs
 */
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createMetadataAccountV3 } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey, signerIdentity, createSignerFromKeypair } from "@metaplex-foundation/umi";
import fs from "fs";
import path from "path";

const MINT = "8w48v3SxPqZWBgAWCPf7muTckPu5cP5UvJQ2ta8rt71s";
const RPC = "https://api.devnet.solana.com";

// Load wallet keypair
const keypairPath = process.env.KEYPAIR_PATH ||
    path.join(process.env.HOME, ".config", "solana", "id.json");
const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));

const umi = createUmi(RPC);

const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
const signer = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(signer));

console.log("Wallet:", signer.publicKey);
console.log("Mint:", MINT);
console.log("Adding metadata: name=TEST, symbol=TEST");

const tx = await createMetadataAccountV3(umi, {
    mint: publicKey(MINT),
    mintAuthority: signer,
    payer: signer,
    updateAuthority: signer.publicKey,
    data: {
        name: "TEST",
        symbol: "TEST",
        uri: "",
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
    },
    isMutable: true,
    collectionDetails: null,
}).sendAndConfirm(umi);

console.log("Metadata added! TX:", Buffer.from(tx.signature).toString("base64"));

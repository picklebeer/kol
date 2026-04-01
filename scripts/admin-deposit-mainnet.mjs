/**
 * Admin deposit KOL tokens into the mainnet vault
 * Usage: node scripts/admin-deposit-mainnet.mjs
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("AB78g7yHF2EdZ3uhBdsPuxSkxm2SykW4RYTCuivmKJcx");
const TOKEN_MINT = new PublicKey("B1NeyU5Yjpk2qEnFf1QXPsmPwTbY5iFfwegVnJcopump");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const RPC = "https://mainnet.helius-rpc.com/?api-key=d30179d2-f443-48a3-8284-566418c3f46d";

const GAME_STATE_SEED = Buffer.from("game_state");
const VAULT_SEED = Buffer.from("vault");

// 5,000,000 KOL (6 decimals)
const DEPOSIT_AMOUNT = BigInt("5000000000000");

const keypairPath = process.env.KEYPAIR_PATH || path.join(process.env.HOME, ".config", "solana", "id.json");
const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
const authority = Keypair.fromSecretKey(secretKey);

const conn = new Connection(RPC, "confirmed");

async function disc(name) {
    const encoded = new TextEncoder().encode(`global:${name}`);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return new Uint8Array(hash).slice(0, 8);
}

function findPDA(seeds) {
    return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

function findATA(wallet, mint) {
    return PublicKey.findProgramAddressSync(
        [wallet.toBytes(), TOKEN_2022_PROGRAM_ID.toBytes(), mint.toBytes()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
}

async function main() {
    console.log("═══════════════════════════════════════");
    console.log("  Admin Deposit — 5,000,000 KOL");
    console.log("═══════════════════════════════════════\n");

    const [gameStatePDA] = findPDA([GAME_STATE_SEED]);
    const [vaultPDA] = findPDA([VAULT_SEED]);
    const [authorityATA] = findATA(authority.publicKey, TOKEN_MINT);

    console.log("  Authority:", authority.publicKey.toBase58());
    console.log("  Authority ATA:", authorityATA.toBase58());
    console.log("  Vault PDA:", vaultPDA.toBase58());

    // Check authority token balance
    try {
        const bal = await conn.getTokenAccountBalance(authorityATA);
        console.log("  Authority KOL balance:", bal.value.uiAmountString);
    } catch (e) {
        console.error("  Could not fetch authority token balance. Does the ATA exist?");
        console.error("  ATA:", authorityATA.toBase58());
        process.exit(1);
    }

    // Build admin_deposit instruction
    // AdminVault account order: authority, game_state, token_mint, authority_token, vault, token_program
    const discriminator = await disc("admin_deposit");
    const data = Buffer.alloc(8 + 8);
    data.set(discriminator, 0);
    data.writeBigUInt64LE(DEPOSIT_AMOUNT, 8);

    const keys = [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameStatePDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: authorityATA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const tx = new Transaction().add(ix);
    tx.feePayer = authority.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(authority);

    console.log("\n  Sending deposit transaction...");
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    console.log("  TX:", sig);

    // Check vault balance after
    try {
        const vaultBal = await conn.getTokenAccountBalance(vaultPDA);
        console.log("\n  Vault balance after deposit:", vaultBal.value.uiAmountString, "KOL");
    } catch {
        console.log("\n  (Could not read vault balance)");
    }

    console.log("\nDone!");
}

main().catch(console.error);

/**
 * Initialize the KOL game on MAINNET:
 * 1. Call `initialize` to create GameState + vault
 * 2. Call `init_oil_line` for ranks 1-10
 *
 * Usage: node scripts/init-game-mainnet.mjs
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("AB78g7yHF2EdZ3uhBdsPuxSkxm2SykW4RYTCuivmKJcx");
const TOKEN_MINT = new PublicKey("B1NeyU5Yjpk2qEnFf1QXPsmPwTbY5iFfwegVnJcopump");
const TOKEN_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const RPC = "https://mainnet.helius-rpc.com/?api-key=d30179d2-f443-48a3-8284-566418c3f46d";

const GAME_STATE_SEED = Buffer.from("game_state");
const OIL_LINE_SEED = Buffer.from("oil_line");
const VAULT_SEED = Buffer.from("vault");

// Load keypair
const keypairPath = process.env.KEYPAIR_PATH || path.join(process.env.HOME, ".config", "solana", "id.json");
const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
const authority = Keypair.fromSecretKey(secretKey);

const conn = new Connection(RPC, "confirmed");

// Anchor discriminator
async function disc(name) {
    const encoded = new TextEncoder().encode(`global:${name}`);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return new Uint8Array(hash).slice(0, 8);
}

// PDA helpers
function findPDA(seeds) {
    return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

async function initializeGame() {
    const [gameStatePDA] = findPDA([GAME_STATE_SEED]);
    const [vaultPDA] = findPDA([VAULT_SEED]);

    // Check if already initialized
    const existing = await conn.getAccountInfo(gameStatePDA);
    if (existing) {
        console.log("GameState already exists:", gameStatePDA.toBase58());
        return gameStatePDA;
    }

    console.log("Initializing game...");
    console.log("  GameState PDA:", gameStatePDA.toBase58());
    console.log("  Vault PDA:", vaultPDA.toBase58());
    console.log("  Token Mint:", TOKEN_MINT.toBase58());
    console.log("  Authority:", authority.publicKey.toBase58());

    const data = Buffer.from(await disc("initialize"));

    const keys = [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameStatePDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const tx = new Transaction().add(ix);
    tx.feePayer = authority.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(authority);

    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    console.log("  TX:", sig);

    return gameStatePDA;
}

async function initOilLine(rank) {
    const [oilLinePDA] = findPDA([OIL_LINE_SEED, new Uint8Array([rank])]);
    const [gameStatePDA] = findPDA([GAME_STATE_SEED]);

    // Check if already initialized
    const existing = await conn.getAccountInfo(oilLinePDA);
    if (existing) {
        console.log(`  Oil line #${rank} already exists`);
        return;
    }

    const discriminator = await disc("init_oil_line");
    const data = Buffer.alloc(9);
    data.set(discriminator, 0);
    data.writeUInt8(rank, 8);

    const keys = [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameStatePDA, isSigner: false, isWritable: false },
        { pubkey: oilLinePDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const tx = new Transaction().add(ix);
    tx.feePayer = authority.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(authority);

    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    console.log(`  Oil line #${rank} initialized — TX: ${sig}`);
}

// Run
console.log("═══════════════════════════════════════");
console.log("  KOL Game MAINNET Initialization");
console.log("═══════════════════════════════════════\n");

console.log(`Balance: ${(await conn.getBalance(authority.publicKey)) / 1e9} SOL\n`);

await initializeGame();

console.log("\nInitializing oil lines...");
for (let rank = 1; rank <= 10; rank++) {
    await initOilLine(rank);
}

console.log("\nDone! Game is ready on MAINNET.");

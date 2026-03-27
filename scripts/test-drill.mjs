/**
 * Test the full on-chain drill flow from CLI:
 * 1. Register player (if needed)
 * 2. Drill rank 10 (lowest min stake: 2,500 KOL)
 *
 * Usage: node scripts/test-drill.mjs
 */
import {
    Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
    SystemProgram, SYSVAR_RENT_PUBKEY
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("aEZUE9ooMZ81eMMFppHzsPVYWxhiNMUjf7eDLATDZtT");
const TOKEN_MINT = new PublicKey("8w48v3SxPqZWBgAWCPf7muTckPu5cP5UvJQ2ta8rt71s");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SLOT_HASHES_SYSVAR = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const RPC = "https://api.devnet.solana.com";

const GAME_STATE_SEED = Buffer.from("game_state");
const OIL_LINE_SEED = Buffer.from("oil_line");
const PLAYER_SEED = Buffer.from("player");
const VAULT_SEED = Buffer.from("vault");

// Load keypair
const keypairPath = path.join(process.env.HOME, ".config", "solana", "id.json");
const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
const wallet = Keypair.fromSecretKey(secretKey);
const conn = new Connection(RPC, "confirmed");

// Anchor discriminator
async function disc(name) {
    const encoded = new TextEncoder().encode(`global:${name}`);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return new Uint8Array(hash).slice(0, 8);
}

function findPDA(seeds) {
    return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

function findATA(walletPubkey, mintPubkey) {
    return PublicKey.findProgramAddressSync(
        [walletPubkey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintPubkey.toBytes()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
}

// Step 1: Register player if needed
async function registerPlayer() {
    const [playerPDA] = findPDA([PLAYER_SEED, wallet.publicKey.toBytes()]);
    const info = await conn.getAccountInfo(playerPDA);
    if (info) {
        console.log("Player already registered:", playerPDA.toBase58());
        return;
    }

    console.log("Registering player...");
    const data = Buffer.from(await disc("register_player"));
    const keys = [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const tx = new Transaction().add(ix);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(wallet);

    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    console.log("  Registered! TX:", sig);
}

// Step 2: Drill
async function drill(rank, stakeKOL) {
    const [gameStatePDA] = findPDA([GAME_STATE_SEED]);
    const [oilLinePDA] = findPDA([OIL_LINE_SEED, new Uint8Array([rank])]);
    const [playerPDA] = findPDA([PLAYER_SEED, wallet.publicKey.toBytes()]);
    const [vaultPDA] = findPDA([VAULT_SEED]);
    const [challengerATA] = findATA(wallet.publicKey, TOKEN_MINT);

    // Check balances before
    const ataInfo = await conn.getTokenAccountBalance(challengerATA);
    console.log(`\nWallet token balance: ${ataInfo.value.uiAmountString} KOL`);

    const vaultInfo = await conn.getTokenAccountBalance(vaultPDA);
    console.log(`Vault balance: ${vaultInfo.value.uiAmountString} KOL`);

    // Check if oil line has a defender
    const oilLineInfo = await conn.getAccountInfo(oilLinePDA);
    const oilLineData = new Uint8Array(oilLineInfo.data);
    const holderBytes = oilLineData.slice(9, 41);
    const isUnclaimed = holderBytes.every(b => b === 0);

    let defenderPDA = null;
    if (!isUnclaimed) {
        const holderPubkey = new PublicKey(holderBytes);
        [defenderPDA] = findPDA([PLAYER_SEED, holderPubkey.toBytes()]);
        console.log("Defender:", holderPubkey.toBase58());
    } else {
        console.log("Position unclaimed");
    }

    // Build drill instruction
    const discriminator = await disc("drill");
    const stakeAmount = BigInt(Math.floor(stakeKOL * 1e9));
    const clientSeed = new Uint8Array(16);
    crypto.getRandomValues(clientSeed);

    const dataBuffer = new ArrayBuffer(8 + 1 + 8 + 16);
    const dataView = new DataView(dataBuffer);
    const dataArr = new Uint8Array(dataBuffer);

    dataArr.set(discriminator, 0);
    dataView.setUint8(8, rank);
    dataView.setBigUint64(9, stakeAmount, true);
    dataArr.set(clientSeed, 17);

    const keys = [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameStatePDA, isSigner: false, isWritable: true },
        { pubkey: oilLinePDA, isSigner: false, isWritable: true },
        { pubkey: playerPDA, isSigner: false, isWritable: true },
    ];

    if (defenderPDA) {
        keys.push({ pubkey: defenderPDA, isSigner: false, isWritable: true });
    } else {
        keys.push({ pubkey: PROGRAM_ID, isSigner: false, isWritable: false });
    }

    keys.push(
        { pubkey: challengerATA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: SLOT_HASHES_SYSVAR, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    );

    console.log(`\nDrilling rank ${rank} with ${stakeKOL} KOL (${stakeAmount} base units)...`);
    console.log("Accounts:");
    const labels = ["challenger", "gameState", "oilLine", "player", "defender", "challengerATA", "vault", "slotHashes", "tokenProgram"];
    keys.forEach((k, i) => console.log(`  ${labels[i]}: ${k.pubkey.toBase58()}`));

    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data: dataArr });
    const tx = new Transaction().add(ix);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(wallet);

    try {
        const sig = await conn.sendRawTransaction(tx.serialize());
        console.log("\nTX sent:", sig);
        await conn.confirmTransaction(sig, "confirmed");
        console.log("TX confirmed!");

        // Check balances after
        const ataAfter = await conn.getTokenAccountBalance(challengerATA);
        console.log(`\nWallet token balance after: ${ataAfter.value.uiAmountString} KOL`);
        const vaultAfter = await conn.getTokenAccountBalance(vaultPDA);
        console.log(`Vault balance after: ${vaultAfter.value.uiAmountString} KOL`);

        // Get tx logs
        const txInfo = await conn.getTransaction(sig, { commitment: "confirmed" });
        if (txInfo?.meta?.logMessages) {
            console.log("\nProgram logs:");
            txInfo.meta.logMessages.forEach(l => console.log("  ", l));
        }
    } catch (err) {
        console.error("\nDrill TX failed:", err);
        if (err.logs) {
            console.error("Logs:");
            err.logs.forEach(l => console.error("  ", l));
        }
    }
}

// Run
console.log("═══════════════════════════════════════");
console.log("  KOL On-Chain Drill Test");
console.log("═══════════════════════════════════════");
console.log("Wallet:", wallet.publicKey.toBase58());

await registerPlayer();
await drill(10, 2500); // Rank 10, min stake 2,500 KOL

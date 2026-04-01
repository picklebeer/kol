// ═══════════════════════════════════════════════════
// Solana Contract Client (KOL Game)
// ═══════════════════════════════════════════════════
//
// Uses @solana/web3.js from CDN. No build step needed.
// Falls back to backend API if on-chain calls fail.

// Program ID — replace with actual deployed address
const PROGRAM_ID = new solanaWeb3.PublicKey('AB78g7yHF2EdZ3uhBdsPuxSkxm2SykW4RYTCuivmKJcx');
const TOKEN_DECIMALS = 6;

// PDA seeds (must match Anchor program)
const GAME_STATE_SEED = new TextEncoder().encode('game_state');
const OIL_LINE_SEED = new TextEncoder().encode('oil_line');
const PLAYER_SEED = new TextEncoder().encode('player');
const VAULT_SEED = new TextEncoder().encode('vault');

// Anchor discriminators (first 8 bytes of SHA-256("global:<instruction_name>"))
// Pre-computed for each instruction
const IX_DISCRIMINATORS = {
    initialize: null,       // admin-only, not called from frontend
    init_oil_line: null,    // admin-only
    register_player: null,  // computed below
    drill: null,
    withdraw: null,
};

// ─── Connection ───

let solConnection = null;

function getSolConnection() {
    if (!solConnection) {
        // Default to mainnet; can be overridden
        const rpcUrl = window.KOL_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=d30179d2-f443-48a3-8284-566418c3f46d';
        solConnection = new solanaWeb3.Connection(rpcUrl, 'confirmed');
    }
    return solConnection;
}

// ─── PDA Derivation ───

async function findGameStatePDA() {
    return solanaWeb3.PublicKey.findProgramAddressSync(
        [GAME_STATE_SEED],
        PROGRAM_ID
    );
}

async function findOilLinePDA(rank) {
    return solanaWeb3.PublicKey.findProgramAddressSync(
        [OIL_LINE_SEED, new Uint8Array([rank])],
        PROGRAM_ID
    );
}

async function findPlayerPDA(walletPubkey) {
    return solanaWeb3.PublicKey.findProgramAddressSync(
        [PLAYER_SEED, walletPubkey.toBytes()],
        PROGRAM_ID
    );
}

async function findVaultPDA() {
    return solanaWeb3.PublicKey.findProgramAddressSync(
        [VAULT_SEED],
        PROGRAM_ID
    );
}

// ─── Anchor Discriminator Helper ───

async function anchorDiscriminator(instructionName) {
    const preimage = `global:${instructionName}`;
    const encoded = new TextEncoder().encode(preimage);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return new Uint8Array(hashBuffer).slice(0, 8);
}

// ─── Account Deserialization (manual Borsh) ───

function deserializeGameState(data) {
    // Skip 8-byte discriminator
    const view = new DataView(data.buffer, data.byteOffset + 8);
    let offset = 0;

    const authority = new solanaWeb3.PublicKey(data.slice(8, 40));
    offset = 32;
    const tokenMint = new solanaWeb3.PublicKey(data.slice(40, 72));
    offset = 64;
    const vault = new solanaWeb3.PublicKey(data.slice(72, 104));
    offset = 96;
    const paused = view.getUint8(offset) === 1;
    offset += 1;
    const totalChallenges = Number(view.getBigUint64(offset, true));
    offset += 8;
    const bump = view.getUint8(offset);

    return { authority: authority.toBase58(), tokenMint: tokenMint.toBase58(), vault: vault.toBase58(), paused, totalChallenges, bump };
}

function deserializeOilLine(data) {
    const view = new DataView(data.buffer, data.byteOffset + 8);
    let offset = 0;

    const rank = view.getUint8(offset); offset += 1;
    const holder = new solanaWeb3.PublicKey(data.slice(9, 41));
    offset = 33;
    const stakeAmount = Number(view.getBigUint64(offset, true)); offset += 8;
    const defenses = view.getUint32(offset, true); offset += 4;
    const claimedAt = Number(view.getBigInt64(offset, true)); offset += 8;
    const bump = view.getUint8(offset);

    const isUnclaimed = holder.equals(solanaWeb3.PublicKey.default);

    return {
        rank,
        holder: isUnclaimed ? null : holder.toBase58(),
        stake_amount: stakeAmount / Math.pow(10, TOKEN_DECIMALS),
        defenses,
        claimed_at: claimedAt,
        bump,
    };
}

function deserializePlayer(data) {
    const view = new DataView(data.buffer, data.byteOffset + 8);
    let offset = 0;

    const authority = new solanaWeb3.PublicKey(data.slice(8, 40));
    offset = 32;
    const wins = view.getUint32(offset, true); offset += 4;
    const losses = view.getUint32(offset, true); offset += 4;
    const totalWon = Number(view.getBigUint64(offset, true)); offset += 8;
    const totalStaked = Number(view.getBigUint64(offset, true)); offset += 8;
    const lastChallengeAt = Number(view.getBigInt64(offset, true)); offset += 8;
    const pendingWithdraw = Number(view.getBigUint64(offset, true)); offset += 8;
    const bump = view.getUint8(offset);

    return {
        address: authority.toBase58(),
        wins,
        losses,
        total_won: totalWon / Math.pow(10, TOKEN_DECIMALS),
        total_staked: totalStaked / Math.pow(10, TOKEN_DECIMALS),
        last_challenge_at: lastChallengeAt,
        pending_withdraw: pendingWithdraw / Math.pow(10, TOKEN_DECIMALS),
        win_rate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
    };
}

// ─── On-chain Reads ───

async function fetchPipelineOnChain() {
    const conn = getSolConnection();
    const lines = [];

    for (let rank = 1; rank <= 10; rank++) {
        try {
            const [pda] = await findOilLinePDA(rank);
            const info = await conn.getAccountInfo(pda);
            if (info && info.data) {
                lines.push(deserializeOilLine(new Uint8Array(info.data)));
            } else {
                lines.push({ rank, holder: null, stake_amount: 0, defenses: 0 });
            }
        } catch {
            lines.push({ rank, holder: null, stake_amount: 0, defenses: 0 });
        }
    }

    return lines;
}

async function fetchPlayerOnChain(address) {
    try {
        const conn = getSolConnection();
        const walletPubkey = new solanaWeb3.PublicKey(address);
        const [pda] = await findPlayerPDA(walletPubkey);
        const info = await conn.getAccountInfo(pda);
        if (info && info.data) {
            return deserializePlayer(new Uint8Array(info.data));
        }
    } catch (err) {
        console.warn('[KOL Contract] fetchPlayerOnChain failed:', err);
    }
    return null;
}

// ─── Transaction Builders ───

async function buildRegisterPlayerTx(walletPubkey) {
    const conn = getSolConnection();
    const [playerPDA] = await findPlayerPDA(walletPubkey);
    const disc = await anchorDiscriminator('register_player');

    const keys = [
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: playerPDA, isSigner: false, isWritable: true },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new solanaWeb3.TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data: new Uint8Array(disc),
    });

    const tx = new solanaWeb3.Transaction().add(ix);
    tx.feePayer = walletPubkey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    return tx;
}

async function buildDrillTx(walletPubkey, rank, stakeAmount, clientSeed) {
    const conn = getSolConnection();
    const [gameStatePDA] = await findGameStatePDA();
    const [oilLinePDA] = await findOilLinePDA(rank);
    const [playerPDA] = await findPlayerPDA(walletPubkey);
    const [vaultPDA] = await findVaultPDA();

    // Get game state to find token mint
    const gameInfo = await conn.getAccountInfo(gameStatePDA);
    const gameState = deserializeGameState(new Uint8Array(gameInfo.data));
    const tokenMint = new solanaWeb3.PublicKey(gameState.tokenMint);

    // Get challenger's associated token account
    const challengerATA = await getAssociatedTokenAddress(walletPubkey, tokenMint);

    // Check if position has a defender
    const oilLineInfo = await conn.getAccountInfo(oilLinePDA);
    const oilLine = deserializeOilLine(new Uint8Array(oilLineInfo.data));
    let defenderPDA = null;
    if (oilLine.holder) {
        const defenderPubkey = new solanaWeb3.PublicKey(oilLine.holder);
        [defenderPDA] = await findPlayerPDA(defenderPubkey);
    }

    const disc = await anchorDiscriminator('drill');

    // Serialize instruction data: disc (8) + rank (1) + stake_amount (8) + client_seed (16)
    const stakeAmountBN = BigInt(Math.floor(stakeAmount * Math.pow(10, TOKEN_DECIMALS)));
    const dataBuffer = new ArrayBuffer(8 + 1 + 8 + 16);
    const dataView = new DataView(dataBuffer);
    const dataArr = new Uint8Array(dataBuffer);

    dataArr.set(disc, 0);
    dataView.setUint8(8, rank);
    dataView.setBigUint64(9, stakeAmountBN, true);
    dataArr.set(clientSeed, 17);

    const SLOT_HASHES_SYSVAR = new solanaWeb3.PublicKey('SysvarS1otHashes111111111111111111111111111');
    const TOKEN_2022_PROGRAM_ID = new solanaWeb3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

    const keys = [
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: gameStatePDA, isSigner: false, isWritable: true },
        { pubkey: oilLinePDA, isSigner: false, isWritable: true },
        { pubkey: playerPDA, isSigner: false, isWritable: true },
    ];

    // Optional defender account
    if (defenderPDA) {
        keys.push({ pubkey: defenderPDA, isSigner: false, isWritable: true });
    } else {
        // Anchor optional: pass program ID as "None"
        keys.push({ pubkey: PROGRAM_ID, isSigner: false, isWritable: false });
    }

    keys.push(
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: challengerATA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: SLOT_HASHES_SYSVAR, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    );

    const ix = new solanaWeb3.TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data: dataArr,
    });

    const tx = new solanaWeb3.Transaction().add(ix);
    tx.feePayer = walletPubkey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    return tx;
}

async function buildWithdrawTx(walletPubkey) {
    const conn = getSolConnection();
    const [gameStatePDA] = await findGameStatePDA();
    const [playerPDA] = await findPlayerPDA(walletPubkey);
    const [vaultPDA] = await findVaultPDA();

    const gameInfo = await conn.getAccountInfo(gameStatePDA);
    const gameState = deserializeGameState(new Uint8Array(gameInfo.data));
    const tokenMint = new solanaWeb3.PublicKey(gameState.tokenMint);
    const playerATA = await getAssociatedTokenAddress(walletPubkey, tokenMint);

    const disc = await anchorDiscriminator('withdraw');
    const TOKEN_2022_PROGRAM_ID = new solanaWeb3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

    const keys = [
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: gameStatePDA, isSigner: false, isWritable: false },
        { pubkey: playerPDA, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: playerATA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const ix = new solanaWeb3.TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data: new Uint8Array(disc),
    });

    const tx = new solanaWeb3.Transaction().add(ix);
    tx.feePayer = walletPubkey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    return tx;
}

// ─── Associated Token Address (manual derivation, no extra CDN) ───

async function getAssociatedTokenAddress(walletPubkey, mintPubkey) {
    const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const TOKEN_2022_PROGRAM_ID = new solanaWeb3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

    const [ata] = solanaWeb3.PublicKey.findProgramAddressSync(
        [
            walletPubkey.toBytes(),
            TOKEN_2022_PROGRAM_ID.toBytes(),
            mintPubkey.toBytes(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
}

// ─── Sign & Send Helpers ───

async function signAndSendTransaction(tx) {
    if (!connectedWallet) throw new Error('Wallet not connected');

    const signed = await connectedWallet.signTransaction(tx);
    const conn = getSolConnection();
    const sig = await conn.sendRawTransaction(signed.serialize());
    await conn.confirmTransaction(sig, 'confirmed');
    return sig;
}

// ─── Public API (chain-first, API-fallback) ───

async function contractFetchPipeline() {
    try {
        return await fetchPipelineOnChain();
    } catch (err) {
        console.warn('[KOL] On-chain pipeline fetch failed, falling back to API:', err);
        return await fetchPipeline();
    }
}

async function contractFetchPlayer(address) {
    try {
        const onChain = await fetchPlayerOnChain(address);
        if (onChain) return onChain;
    } catch (err) {
        console.warn('[KOL] On-chain player fetch failed:', err);
    }
    return await fetchPlayerData(address);
}

async function contractDrill(rank, stakeAmount) {
    if (!connectedWallet || !walletAddress) throw new Error('Wallet not connected');

    const walletPubkey = new solanaWeb3.PublicKey(walletAddress);
    const conn = getSolConnection();

    // Ensure player is registered on-chain (required before drill)
    const [playerPDA] = await findPlayerPDA(walletPubkey);
    const playerInfo = await conn.getAccountInfo(playerPDA);
    if (!playerInfo) {
        console.log('[KOL] Registering player on-chain...');
        const regTx = await buildRegisterPlayerTx(walletPubkey);
        await signAndSendTransaction(regTx);
        console.log('[KOL] Player registered.');
    }

    // Generate client seed
    const clientSeed = crypto.getRandomValues(new Uint8Array(16));

    // Build and send the drill transaction (includes token transfer)
    const tx = await buildDrillTx(walletPubkey, rank, stakeAmount, clientSeed);
    const sig = await signAndSendTransaction(tx);

    console.log('[KOL] Drill TX confirmed:', sig);

    // Parse the DrillResult event from transaction logs
    const result = await parseDrillResult(sig, stakeAmount);
    return result;
}

async function parseDrillResult(sig, stakeAmount) {
    const conn = getSolConnection();

    // RPC may not have indexed the TX immediately after confirmation — retry up to 3 times
    let txInfo = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        txInfo = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (txInfo) break;
        await new Promise(r => setTimeout(r, 2000));
    }

    // Default result
    const result = { signature: sig, stake_amount: stakeAmount };

    if (!txInfo?.meta?.logMessages) {
        result.outcome = 'pending';
        return result;
    }

    // Look for the Anchor event data in "Program data:" log line
    const dataLog = txInfo.meta.logMessages.find(l => l.startsWith('Program data:'));
    if (dataLog) {
        try {
            const b64 = dataLog.replace('Program data: ', '');
            const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

            // DrillResult layout after 8-byte event discriminator:
            // challenger: 32, rank: 1, stake_amount: 8, roll: 2, win_threshold: 2,
            // outcome string (4-byte len + utf8), payout: 8, seed_hash: 32, timestamp: 8
            const view = new DataView(raw.buffer, raw.byteOffset);
            let off = 8; // skip event discriminator
            off += 32;   // skip challenger pubkey
            const rankResult = raw[off]; off += 1;
            const stakeResult = Number(view.getBigUint64(off, true)) / Math.pow(10, TOKEN_DECIMALS); off += 8;
            const roll = view.getUint16(off, true); off += 2;
            const winThreshold = view.getUint16(off, true); off += 2;

            // Borsh string: 4-byte length + utf8 bytes
            const strLen = view.getUint32(off, true); off += 4;
            const outcomeStr = new TextDecoder().decode(raw.slice(off, off + strLen)); off += strLen;

            const payout = Number(view.getBigUint64(off, true)) / Math.pow(10, TOKEN_DECIMALS); off += 8;
            const seedHash = Array.from(raw.slice(off, off + 32)).map(b => b.toString(16).padStart(2, '0')).join('');

            result.outcome = outcomeStr === 'win' ? 'win' : 'lose';
            result.roll = roll;
            result.win_threshold = winThreshold;
            result.payout = payout;
            result.stake_amount = stakeResult;
            result.server_seed_hash = seedHash;
            result.server_seed = '';

            console.log('[KOL] Drill result:', outcomeStr, 'roll:', roll, '/', winThreshold);
        } catch (err) {
            console.warn('[KOL] Failed to parse DrillResult event:', err);
            result.outcome = 'pending';
        }
    } else {
        result.outcome = 'pending';
    }

    return result;
}

async function contractWithdraw() {
    if (!connectedWallet || !walletAddress) throw new Error('Wallet not connected');

    const walletPubkey = new solanaWeb3.PublicKey(walletAddress);
    const tx = await buildWithdrawTx(walletPubkey);
    return await signAndSendTransaction(tx);
}

// ─── Token Balance ───

async function fetchKolBalance(address) {
    try {
        const conn = getSolConnection();
        const walletPubkey = new solanaWeb3.PublicKey(address);
        const [gameStatePDA] = await findGameStatePDA();
        const gameInfo = await conn.getAccountInfo(gameStatePDA);
        const gameState = deserializeGameState(new Uint8Array(gameInfo.data));
        const tokenMint = new solanaWeb3.PublicKey(gameState.tokenMint);
        const ata = await getAssociatedTokenAddress(walletPubkey, tokenMint);
        const balance = await conn.getTokenAccountBalance(ata);
        return Number(balance.value.uiAmount);
    } catch {
        return 0;
    }
}

console.log('[KOL Contract] Client loaded. Program:', PROGRAM_ID.toBase58());

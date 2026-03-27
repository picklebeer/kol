// ═══════════════════════════════════════════════════
// API Client
// ═══════════════════════════════════════════════════

const API_BASE = '/api';

async function apiFetch(path, options = {}) {
    try {
        const resp = await fetch(`${API_BASE}${path}`, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        return await resp.json();
    } catch (err) {
        console.error(`[KOL API] ${path}:`, err);
        throw err;
    }
}

async function fetchTokenInfo() {
    return apiFetch('/token-info');
}

async function verifyWallet(address) {
    return apiFetch('/verify-wallet', {
        method: 'POST',
        body: JSON.stringify({ address, message: 'KOL Auth', signature: '' }),
    });
}

async function fetchPipeline() {
    return apiFetch('/pipeline');
}

async function submitChallengeAPI(challenger, targetRank, stakeAmount, clientSeed) {
    return apiFetch('/challenge', {
        method: 'POST',
        body: JSON.stringify({
            challenger,
            target_rank: targetRank,
            stake_amount: stakeAmount,
            client_seed: clientSeed,
        }),
    });
}

async function fetchLeaderboard() {
    return apiFetch('/leaderboard');
}

async function fetchPlayerData(address) {
    return apiFetch(`/player/${address}`);
}

async function fetchPlayerHistory(address) {
    return apiFetch(`/history/${address}`);
}

async function syncTransaction(signature) {
    return apiFetch('/sync-tx', {
        method: 'POST',
        body: JSON.stringify({ signature }),
    });
}

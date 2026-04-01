// ═══════════════════════════════════════════════════
// Game Logic & Pipeline UI
// ═══════════════════════════════════════════════════

let currentPipeline = [];
let challengeTarget = null;

const MIN_STAKES = {
    1: 100000, 2: 75000, 3: 50000, 4: 35000, 5: 25000,
    6: 15000, 7: 10000, 8: 7500, 9: 5000, 10: 2500,
};

// Historical pipeline names — ranked by prestige
const PIPELINE_NAMES = {
    1:  'Ghawar',               // Largest oil field ever discovered, Saudi Arabia, 1948
    2:  'Kirkuk-Ceyhan',        // 970 km pipeline, Iraq to Turkey, 1977
    3:  'Trans-Arabian',        // Tapline — 1,213 km, Saudi Arabia to Lebanon, 1950
    4:  'Abqaiq',               // Massive Saudi processing hub & oil field
    5:  'Burgan',               // Second-largest oil field, Kuwait, 1938
    6:  'Marib',                // Ancient Yemeni kingdom, modern oil province
    7:  'Dura Europos',         // Ancient Mesopotamian city, early bitumen use
    8:  'Bab al-Mandeb',        // Strategic strait between Yemen and Djibouti
    9:  'Sidon',                // Ancient Phoenician port city, Lebanon
    10: 'Dilmun',               // Mythical land of plenty, ancient Bahrain
};

// ─── Render Pipeline ───

async function loadPipeline() {
    try {
        currentPipeline = (typeof contractFetchPipeline === 'function')
            ? await contractFetchPipeline()
            : await fetchPipeline();
        renderPipeline(currentPipeline);
    } catch (err) {
        console.error('[KOL] Failed to load pipeline:', err);
    }
}

function renderPipeline(pipeline) {
    const container = document.getElementById('pipeline-container');
    container.innerHTML = '';

    for (const pos of pipeline) {
        const el = document.createElement('div');
        el.className = `oil-line${pos.rank <= 3 ? ` rank-${pos.rank}` : ''}`;

        const holderDisplay = pos.holder
            ? (pos.username || truncAddr(pos.holder))
            : 'UNCLAIMED';
        const holderClass = pos.holder ? '' : 'empty';

        const lineName = PIPELINE_NAMES[pos.rank] || `Line ${pos.rank}`;
        const minStake = MIN_STAKES[pos.rank] || 2500;

        el.innerHTML = `
            <div class="rank-badge">#${pos.rank}</div>
            <div class="position-info">
                <div class="position-name">${lineName}</div>
                <div class="position-holder ${holderClass}">${holderDisplay}
                    ${pos.defenses > 0 ? `<span style="color: var(--text-muted); font-size: 0.7rem; margin-left: 0.4rem;">${pos.defenses} held</span>` : ''}
                </div>
            </div>
            <div class="position-stake">
                ${pos.stake_amount > 0 ? formatNum(pos.stake_amount) + ' KOL' : '--'}
                <div class="position-min">Min: ${formatNum(minStake)} KOL</div>
            </div>
            <div class="position-actions">
                <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;"
                    onclick="openChallenge(${pos.rank})">
                    DRILL
                </button>
            </div>
        `;

        container.appendChild(el);
    }
}

// ─── Drill Modal ───

function openChallenge(rank) {
    if (!isConnected()) {
        alert('Connect your wallet first.');
        return;
    }

    challengeTarget = rank;
    const pos = currentPipeline.find(p => p.rank === rank);
    const minStake = MIN_STAKES[rank] || 250;

    const lineName = PIPELINE_NAMES[rank] || `Line ${rank}`;
    document.getElementById('modal-rank').textContent = rank;
    document.getElementById('modal-line-name').textContent = lineName;
    document.getElementById('modal-holder').textContent = pos?.holder
        ? (pos.username || truncAddr(pos.holder))
        : 'UNCLAIMED';
    document.getElementById('stake-input').placeholder = `Min: ${formatNum(minStake)}`;
    document.getElementById('stake-input').min = minStake;
    document.getElementById('stake-input').value = minStake;

    updateWinChance(minStake, minStake);

    document.getElementById('challenge-form').style.display = 'block';
    document.getElementById('challenge-result').style.display = 'none';
    document.getElementById('challenge-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('challenge-modal').classList.remove('active');
    challengeTarget = null;
}

// Update win chance display on input change
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('stake-input');
    if (input) {
        input.addEventListener('input', () => {
            const rank = challengeTarget;
            const minStake = MIN_STAKES[rank] || 250;
            updateWinChance(parseFloat(input.value) || 0, minStake);
        });
    }
});

function updateWinChance(stake, minStake) {
    const bonus = Math.floor((stake - minStake) / 100);
    const chance = Math.min(45 + bonus, 65);
    document.getElementById('win-chance').textContent = `${chance}%`;

    const payout = (stake * 1.8).toFixed(0);
    document.getElementById('potential-payout').textContent = `${formatNum(payout)} KOL`;
}

async function submitChallenge() {
    if (!challengeTarget || !walletAddress) return;

    const stake = parseFloat(document.getElementById('stake-input').value);
    const minStake = MIN_STAKES[challengeTarget] || 250;

    if (!stake || stake < minStake) {
        alert(`Minimum stake for line ${challengeTarget} is ${formatNum(minStake)} KOL`);
        return;
    }

    // On-chain drill — tokens are transferred via smart contract
    try {
        const result = await contractDrill(challengeTarget, stake);
        showResult(result);
        // Sync backend DB with on-chain state
        try { await syncTransaction(result.signature); } catch {}
        await loadPipeline();
        await loadLeaderboard();
        if (walletAddress) await loadPlayerData(walletAddress);
    } catch (err) {
        console.error('[KOL] Drill failed:', err);
        alert('Drill failed: ' + (err.message || err));
    }
}

function showResult(result) {
    document.getElementById('challenge-form').style.display = 'none';
    document.getElementById('challenge-result').style.display = 'block';

    const outcomeEl = document.getElementById('result-outcome');
    if (result.outcome === 'pending') {
        outcomeEl.textContent = 'DRILLING...';
        outcomeEl.className = 'outcome pending';
    } else {
        outcomeEl.textContent = result.outcome === 'win' ? 'STRIKE OIL' : 'DRY WELL';
        outcomeEl.className = `outcome ${result.outcome}`;
    }

    if (result.outcome === 'pending') {
        document.getElementById('result-details').innerHTML = `
            <div><span class="label">Stake:</span> <span class="value">${formatNum(result.stake_amount)} KOL</span></div>
            <div style="margin-top: 1rem; font-size: 0.75rem;">
                <span class="label">TX:</span> <span class="value" style="font-size: 0.7rem; word-break: break-all;">${result.signature || '--'}</span>
            </div>
            <div style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Confirming on-chain... Result will appear shortly.</div>
        `;
    } else {
        document.getElementById('result-details').innerHTML = `
            <div><span class="label">Roll:</span> <span class="value">${result.roll} / 10000</span></div>
            <div><span class="label">Stake:</span> <span class="value">${formatNum(result.stake_amount)} KOL</span></div>
            ${result.outcome === 'win'
                ? `<div><span class="label">Payout:</span> <span class="value" style="color: var(--neon-green);">+${formatNum(result.payout)} KOL</span></div>`
                : `<div><span class="label">Lost:</span> <span class="value" style="color: var(--neon-red);">-${formatNum(result.stake_amount)} KOL</span></div>`
            }
            <div style="margin-top: 1rem; font-size: 0.75rem;">
                <span class="label">Server Seed:</span> <span class="value" style="font-size: 0.7rem; word-break: break-all;">${result.server_seed}</span>
            </div>
            <div style="font-size: 0.75rem;">
                <span class="label">Seed Hash:</span> <span class="value" style="font-size: 0.7rem; word-break: break-all;">${result.server_seed_hash}</span>
            </div>
        `;
    }
}

// ─── Leaderboard ───

async function loadLeaderboard() {
    try {
        const data = await fetchLeaderboard();
        renderLeaderboard(data);
    } catch (err) {
        console.error('[KOL] Failed to load leaderboard:', err);
    }
}

function renderLeaderboard(entries) {
    const container = document.getElementById('leaderboard-container');
    if (entries.length === 0) {
        container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No drillers yet. Be the first.</div>';
        return;
    }

    container.innerHTML = entries.map((e, i) => `
        <div class="lb-row">
            <div class="lb-rank">${i + 1}</div>
            <div class="lb-address">${e.username || truncAddr(e.address)}</div>
            <div class="lb-won">${formatNum(e.total_won)} KOL</div>
            <div class="lb-winrate">${e.win_rate}%</div>
        </div>
    `).join('');
}

// ─── Player Data ───

async function loadPlayerData(address) {
    // Fetch KOL token balance
    if (typeof fetchKolBalance === 'function') {
        try {
            const bal = await fetchKolBalance(address);
            document.getElementById('p-balance').textContent = formatNum(bal) + ' KOL';
        } catch {
            document.getElementById('p-balance').textContent = '--';
        }
    }

    try {
        const player = (typeof contractFetchPlayer === 'function')
            ? await contractFetchPlayer(address)
            : await fetchPlayerData(address);

        document.getElementById('p-wins').textContent = player.wins;
        document.getElementById('p-losses').textContent = player.losses;
        document.getElementById('p-won').textContent = formatNum(player.total_won);

        // Current stake = stake on the oil line the player currently holds
        const heldLine = currentPipeline.find(p => p.holder === address);
        const currentStake = heldLine ? heldLine.stake_amount : 0;
        document.getElementById('p-staked').textContent = currentStake > 0
            ? formatNum(currentStake) + ' KOL'
            : '0';

        // Show withdraw button if pending
        const withdrawBtn = document.getElementById('withdraw-btn');
        if (withdrawBtn && player.pending_withdraw > 0) {
            withdrawBtn.style.display = 'inline-block';
            withdrawBtn.textContent = `Withdraw ${formatNum(player.pending_withdraw)} KOL`;
        } else if (withdrawBtn) {
            withdrawBtn.style.display = 'none';
        }
    } catch {
        // Player may not exist yet
    }
}

async function withdrawWinnings() {
    if (!isConnected()) return;
    try {
        const sig = await contractWithdraw();
        try { await syncTransaction(sig); } catch {}
        alert('Withdrawal submitted! TX: ' + sig);
        await loadPlayerData(walletAddress);
    } catch (err) {
        alert('Withdraw failed: ' + err.message);
    }
}

// ─── Helpers ───

function truncAddr(addr) {
    if (!addr) return '--';
    return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function formatNum(n) {
    if (n === null || n === undefined) return '--';
    return Number(n).toLocaleString();
}

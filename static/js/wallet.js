// ═══════════════════════════════════════════════════
// Wallet Connection (Phantom / Solflare)
// ═══════════════════════════════════════════════════

let connectedWallet = null;
let walletAddress = null;

function getProvider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    return null;
}

async function connectWallet() {
    const provider = getProvider();

    if (!provider) {
        alert('No Solana wallet found. Install Phantom or Solflare.');
        window.open('https://phantom.app/', '_blank');
        return;
    }

    try {
        const resp = await provider.connect();
        connectedWallet = provider;
        walletAddress = resp.publicKey.toString();

        // Update UI
        const btn = document.getElementById('wallet-btn');
        btn.textContent = walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4);
        btn.onclick = disconnectWallet;
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger');

        // Verify with backend
        await verifyWallet(walletAddress);

        // Load player data
        await loadPlayerData(walletAddress);
        document.getElementById('player-panel').style.display = 'block';

        console.log('[KOL] Wallet connected:', walletAddress);
    } catch (err) {
        console.error('[KOL] Wallet connection failed:', err);
    }
}

async function disconnectWallet() {
    if (connectedWallet) {
        try { await connectedWallet.disconnect(); } catch {}
    }
    connectedWallet = null;
    walletAddress = null;

    const btn = document.getElementById('wallet-btn');
    btn.textContent = 'Connect Wallet';
    btn.onclick = connectWallet;
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');

    document.getElementById('player-panel').style.display = 'none';
    console.log('[KOL] Wallet disconnected');
}

function isConnected() {
    return !!walletAddress;
}

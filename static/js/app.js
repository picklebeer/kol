// ═══════════════════════════════════════════════════
// App Controller
// ═══════════════════════════════════════════════════

(async function init() {
    console.log('[KOL] Initializing...');

    // Load token info
    loadTokenInfo();

    // Load game data
    await loadPipeline();
    await loadLeaderboard();

    // Refresh every 30s
    setInterval(async () => {
        await loadPipeline();
        await loadLeaderboard();
        loadTokenInfo();
    }, 30000);

    // Smooth scroll for nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }

            // Update active link
            document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Close modal on overlay click
    document.getElementById('challenge-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    console.log('[KOL] Ready.');
})();

async function loadTokenInfo() {
    try {
        const info = await fetchTokenInfo();
        document.getElementById('token-price').textContent = info.price
            ? `$${info.price.toFixed(6)}`
            : '--';
        document.getElementById('token-mcap').textContent = info.market_cap
            ? `$${formatNum(info.market_cap.toFixed(0))}`
            : '--';
        document.getElementById('token-supply').textContent = info.supply
            ? formatNum(info.supply.toFixed(0))
            : '1,000,000,000';
    } catch {
        // Token not configured yet
    }
}

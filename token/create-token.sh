#!/bin/bash
# ═══════════════════════════════════════════════════
# KOL Token Creation Script (Solana SPL)
# Requires: solana-cli, spl-token
# ═══════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════"
echo "  KOL - SPL Token Creation"
echo "═══════════════════════════════════════"

# Check prerequisites
command -v solana >/dev/null 2>&1 || { echo "Error: solana CLI not installed"; exit 1; }
command -v spl-token >/dev/null 2>&1 || { echo "Error: spl-token CLI not installed"; exit 1; }

# Show current config
echo ""
echo "Current Solana config:"
solana config get
echo ""

KEYPAIR=$(solana config get keypair | awk '{print $3}')
WALLET=$(solana address)
echo "Wallet: $WALLET"
echo "Balance: $(solana balance)"
echo ""

read -p "Create KOL token on this wallet? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi

# Create token with 9 decimals
echo ""
echo "[1/4] Creating token mint..."
MINT=$(spl-token create-token --decimals 9 | grep "Creating token" | awk '{print $3}')
echo "Token Mint: $MINT"

# Create associated token account
echo ""
echo "[2/4] Creating token account..."
ACCOUNT=$(spl-token create-account $MINT | grep "Creating account" | awk '{print $3}')
echo "Token Account: $ACCOUNT"

# Mint initial supply (1 billion)
echo ""
echo "[3/4] Minting 1,000,000,000 KOL..."
spl-token mint $MINT 1000000000
echo "Supply minted."

# Save token info
echo ""
echo "[4/4] Saving token info..."
cat > token-info.json << EOF
{
    "mint": "$MINT",
    "account": "$ACCOUNT",
    "authority": "$WALLET",
    "decimals": 9,
    "supply": 1000000000,
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "═══════════════════════════════════════"
echo "  Token created successfully!"
echo "  Mint: $MINT"
echo "  Supply: 1,000,000,000 KOL"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Add metadata: bash add-metadata.sh"
echo "  2. Disable mint: bash disable-mint.sh"
echo "  3. Update .env with KOL_TOKEN_MINT=$MINT"

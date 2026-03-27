#!/bin/bash
# Disable mint authority (lock supply forever)
set -e

if [ ! -f token-info.json ]; then
    echo "Error: token-info.json not found. Run create-token.sh first."
    exit 1
fi

MINT=$(python3 -c "import json; print(json.load(open('token-info.json'))['mint'])")

echo "═══════════════════════════════════════"
echo "  Disable Mint Authority"
echo "  Token: $MINT"
echo "═══════════════════════════════════════"
echo ""
echo "WARNING: This is irreversible. No more KOL can ever be minted."
echo ""

read -p "Disable mint authority? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi

spl-token authorize $MINT mint --disable

echo ""
echo "Mint authority disabled. Supply is locked forever."

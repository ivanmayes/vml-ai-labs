#!/usr/bin/env bash
set -e

echo "=== UBS (Ultimate Bug Scanner) Setup ==="

if command -v ubs &> /dev/null; then
    echo "[OK] UBS is already installed"
    exit 0
fi

OS=$(uname -s)

if [[ "$OS" == "Darwin" ]]; then
    if ! command -v brew &> /dev/null; then
        echo "[ERROR] Homebrew not found. Install it first or use:"
        echo "  curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/ultimate_bug_scanner/master/install.sh | bash -s -- --easy-mode"
        exit 1
    fi
    brew install dicklesworthstone/tap/ubs
else
    curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/ultimate_bug_scanner/master/install.sh" | bash -s -- --easy-mode
fi

echo "[OK] UBS installed successfully!"

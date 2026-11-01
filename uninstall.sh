#!/usr/bin/env bash
set -e

# ==============================================================================
# MacDock GNOME: Uninstaller Script
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e "${BOLD}${YELLOW}Uninstalling MacDock GNOME...${RESET}"

TARGET_EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/dash2dock-lite@icedman.github.com"

if command -v gnome-extensions &>/dev/null; then
    gnome-extensions disable dash2dock-lite@icedman.github.com 2>/dev/null || true
fi

rm -rf "${TARGET_EXT_DIR}"
echo -e "${GREEN}✓ Extension removed.${RESET}"

echo "Removing system libraries (requires sudo)..."
sudo rm -f /usr/lib/libmacdock_engine.so
sudo rm -f /usr/lib/girepository-1.0/MacDockEngine-1.0.typelib
sudo ldconfig

echo -e "\n${BOLD}${GREEN}MacDock GNOME has been uninstalled successfully.${RESET}\n"

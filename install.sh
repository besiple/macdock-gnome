#!/usr/bin/env bash
set -e

# ==============================================================================
# MacDock GNOME: Installer Script
# High-Performance macOS Physics Dock & App Grid Magnifier for GNOME
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}"
echo "=========================================================="
echo "      🍎 MacDock GNOME: Native macOS Dock Experience      "
echo "=========================================================="
echo -e "${RESET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="${SCRIPT_DIR}/engine"
EXT_DIR="${SCRIPT_DIR}/extension"
TARGET_EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/dash2dock-lite@icedman.github.com"

# 1. Dependency checks
echo -e "${BOLD}[1/5] Checking dependencies...${RESET}"

if ! command -v cargo &>/dev/null; then
    echo -e "${RED}Error: 'cargo' is not installed. Please install Rust (https://rustup.rs/ or pacman -S rust).${RESET}"
    exit 1
fi

if ! command -v sudo &>/dev/null; then
    echo -e "${RED}Error: 'sudo' is required for installing shared library to /usr/lib.${RESET}"
    exit 1
fi

echo -e "${GREEN}✓ All base build tools available.${RESET}"

# 2. Build Rust Physics Engine
echo -e "\n${BOLD}[2/5] Building native Rust physics engine (release mode)...${RESET}"
cd "${ENGINE_DIR}"
cargo build --release

SO_FILE="${ENGINE_DIR}/target/release/libmacdock_engine.so"
if [ ! -f "${SO_FILE}" ]; then
    echo -e "${RED}Error: Build failed, ${SO_FILE} not found.${RESET}"
    exit 1
fi
echo -e "${GREEN}✓ Native engine built successfully.${RESET}"

# Compile Typelib if g-ir-compiler exists, otherwise use pre-compiled
if command -v g-ir-compiler &>/dev/null; then
    echo "Compiling GObject typelib from GIR..."
    g-ir-compiler "${ENGINE_DIR}/MacDockEngine-1.0.gir" -o "${ENGINE_DIR}/MacDockEngine-1.0.typelib"
fi

# 3. Install Shared Library & GI Typelib
echo -e "\n${BOLD}[3/5] Installing engine library and typelib to system...${RESET}"
echo "Requesting sudo permissions..."

# Disable extension first to avoid in-memory dlopen conflicts if already active
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions disable dash2dock-lite@icedman.github.com 2>/dev/null || true
fi

sudo install -m 755 "${SO_FILE}" /usr/lib/libmacdock_engine.so
sudo install -m 644 "${ENGINE_DIR}/MacDockEngine-1.0.typelib" /usr/lib/girepository-1.0/MacDockEngine-1.0.typelib
sudo ldconfig

echo -e "${GREEN}✓ Engine installed to /usr/lib and /usr/lib/girepository-1.0.${RESET}"

# 4. Install GNOME Shell Extension
echo -e "\n${BOLD}[4/5] Installing GNOME Shell Extension...${RESET}"
mkdir -p "${TARGET_EXT_DIR}"
cp -r "${EXT_DIR}"/* "${TARGET_EXT_DIR}/"

if command -v glib-compile-schemas &>/dev/null; then
    glib-compile-schemas "${TARGET_EXT_DIR}/schemas" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Extension installed to ${TARGET_EXT_DIR}.${RESET}"

# 5. Enable & Activate
echo -e "\n${BOLD}[5/5] Activating extension...${RESET}"
if command -v gnome-extensions &>/dev/null; then
    sleep 0.5
    gnome-extensions enable dash2dock-lite@icedman.github.com 2>/dev/null || true
    echo -e "${GREEN}✓ Extension enabled!${RESET}"
else
    echo -e "${YELLOW}Please restart GNOME Shell or log out and log back in to load the extension.${RESET}"
fi

echo -e "\n${BOLD}${GREEN}=========================================================="
echo "          🎉 MacDock GNOME successfully installed!        "
echo "==========================================================${RESET}"
echo -e "Enjoy:"
echo -e "  • ${CYAN}App Grid Magnifier Lens${RESET} (pure in-place zoom, zero labels/boxes)
echo -e "  • ${CYAN}Native Cairo glass bead running dots${RESET} with specular highlights"
echo -e "  • ${CYAN}Realistic rubber squash & stretch bounce${RESET} powered by Rust"
echo -e "  • ${CYAN}Velvet dock slide & auto-hide${RESET}\n"

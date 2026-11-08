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

# 1. Dependency checks & auto-installation
echo -e "${BOLD}[1/5] Checking dependencies...${RESET}"

if ! command -v cargo &>/dev/null; then
    echo -e "${YELLOW}'cargo' (Rust) is not found. Attempting to install build tools...${RESET}"
    if command -v pacman &>/dev/null; then
        sudo pacman -S --needed --noconfirm rust cargo gobject-introspection base-devel
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y rustc cargo libgirepository1.0-dev build-essential
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y rust cargo gobject-introspection-devel gcc
    else
        echo -e "${RED}Error: 'cargo' is not installed. Please install Rust manually (https://rustup.rs/)${RESET}"
        exit 1
    fi
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
    g-ir-compiler "${ENGINE_DIR}/MacDockEngine-1.0.gir" -o "${ENGINE_DIR}/MacDockEngine-1.0.typelib" 2>/dev/null || true
fi

# 3. Install Shared Library & GI Typelib
echo -e "\n${BOLD}[3/5] Installing engine library and typelib to system...${RESET}"
echo "Requesting sudo permissions..."

# Disable conflicting docks and existing instance first
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions disable dash2dock-lite@icedman.github.com 2>/dev/null || true
    gnome-extensions disable ubuntu-dock@ubuntu.com 2>/dev/null || true
    gnome-extensions disable dash-to-dock@vmiceli 2>/dev/null || true
fi

# Install .so to system library paths
sudo install -m 755 "${SO_FILE}" /usr/lib/libmacdock_engine.so
if [ -d "/usr/lib64" ] && [ "/usr/lib64" != "/usr/lib" ]; then
    sudo install -m 755 "${SO_FILE}" /usr/lib64/libmacdock_engine.so 2>/dev/null || true
fi

# Install typelib to GObject Introspection repository directories
sudo mkdir -p /usr/lib/girepository-1.0
sudo install -m 644 "${ENGINE_DIR}/MacDockEngine-1.0.typelib" /usr/lib/girepository-1.0/MacDockEngine-1.0.typelib
if [ -d "/usr/lib64/girepository-1.0" ] && [ "/usr/lib64/girepository-1.0" != "/usr/lib/girepository-1.0" ]; then
    sudo install -m 644 "${ENGINE_DIR}/MacDockEngine-1.0.typelib" /usr/lib64/girepository-1.0/MacDockEngine-1.0.typelib 2>/dev/null || true
fi
sudo ldconfig 2>/dev/null || true

echo -e "${GREEN}✓ Engine installed to system libraries.${RESET}"

# 4. Install GNOME Shell Extension
echo -e "\n${BOLD}[4/5] Installing GNOME Shell Extension...${RESET}"
mkdir -p "${TARGET_EXT_DIR}"
cp -r "${EXT_DIR}"/* "${TARGET_EXT_DIR}/"

if command -v glib-compile-schemas &>/dev/null; then
    glib-compile-schemas "${TARGET_EXT_DIR}/schemas" 2>/dev/null || true
    # Install schema to user glib schemas so gsettings CLI can configure properties immediately
    USER_SCHEMA_DIR="${HOME}/.local/share/glib-2.0/schemas"
    mkdir -p "${USER_SCHEMA_DIR}"
    cp -f "${TARGET_EXT_DIR}/schemas/"*.xml "${USER_SCHEMA_DIR}/" 2>/dev/null || true
    glib-compile-schemas "${USER_SCHEMA_DIR}" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Extension installed to ${TARGET_EXT_DIR}.${RESET}"

# Configure tailored macOS aesthetic preferences
echo -e "\n${BOLD}[*] Applying macOS Dock & App Grid preferences...${RESET}"
if command -v gsettings &>/dev/null; then
    gsettings set org.gnome.shell.extensions.dash2dock-lite autohide-dash true 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite autohide-dodge true 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite autohide-speed 0.5 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite background-color '(0.0, 0.0, 0.0, 0.25)' 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite border-radius 3.0 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite icon-border-radius 3.0 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite edge-distance 0.093 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite hide-labels true 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite icon-shadow true 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite shrink-icons true 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite running-indicator-style 2 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite animate-icons true 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash2dock-lite open-app-animation true 2>/dev/null || true
    echo -e "${GREEN}✓ Preferences configured!${RESET}"
fi

# 5. Enable & Activate
echo -e "\n${BOLD}[5/5] Activating extension...${RESET}"
ACTIVATED=false
if command -v gnome-extensions &>/dev/null; then
    sleep 0.5
    if gnome-extensions enable dash2dock-lite@icedman.github.com 2>/dev/null; then
        ACTIVATED=true
        echo -e "${GREEN}✓ Extension enabled!${RESET}"
    fi
fi

echo -e "\n${BOLD}${GREEN}=========================================================="
echo "          🎉 MacDock GNOME successfully installed!        "
echo "==========================================================${RESET}"
echo -e "Enjoy:"
echo -e "  • ${CYAN}Native Cairo glass bead running dots${RESET} with specular highlights"
echo -e "  • ${CYAN}Realistic rubber squash & stretch bounce${RESET} powered by Rust"
echo -e "  • ${CYAN}Clean floating App Grid${RESET} with zero labels and smooth zoom"
echo -e "  • ${CYAN}Velvet dock slide & auto-hide${RESET}\n"

if [ "$ACTIVATED" = false ]; then
    echo -e "${YELLOW}👉 Если док не появился сразу: просто сделай Log Out и войди снова (в Wayland GNOME сканирует новые расширения при старте сессии).${RESET}\n"
fi

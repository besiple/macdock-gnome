# 🍎 MacDock GNOME

<p align="center">
  <b>Authentic macOS Dock Physics, Cairo Glass Bead Indicators & Velvet Autohide for GNOME Shell</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Language-Rust%20%7C%20JavaScript%20(GJS)-orange?style=flat-square&logo=rust" alt="Language" />
  <img src="https://img.shields.io/badge/GNOME-45%20%7C%2046%20%7C%2047%20%7C%2051-blue?style=flat-square&logo=gnome" alt="GNOME" />
  <img src="https://img.shields.io/badge/Platform-Wayland%20%2F%20X11-purple?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-green?style=flat-square" alt="License" />
</p>

---

## ✨ Features

### 1. 🦀 Native Rust Physics Engine (`macdock-engine`)
* **Zero Frame Drops**: Physics and motion calculations are offloaded to an optimized compiled Rust shared library (`libmacdock_engine.so`) linked via GObject Introspection (`MacDockEngine-1.0.typelib`).
* **True Squash & Stretch**: Icons deform elastically upon landing with volume conservation:
  - Vertical compression (Squash down to 62% on contact).
  - Horizontal expansion (+24% width stretch).
  - Exact floor pinning: bottom edge remains anchored to the dock shelf during deformation.
* **Critically Damped Harmonic Follower**: Natural lens magnification curve powered by a 2nd-order spring-damper filter.

### 2. 🔮 Apple Illuminated Glass Bead Indicators
* **Cairo Radial Gradient**: Faithfully ported from macOS Monterey/Sonoma/Sequoia.
* **Dual-Layer Specular & Shadow**:
  - Crisp ambient shadow for legibility against bright backgrounds.
  - Soft diffuse glow against dark backgrounds.
  - 3-stop radial gradient with specular top-light highlight.
* **Shelf-Anchored**: The running indicator dot remains firmly grounded on the dock shelf even while the application icon bounces energetically above it.

### 3. 🪶 Velvet Dock Autohide
* Completely eliminated the abrupt "double-zoom" glitch during reveal.
* Proximity magnification is smoothly suppressed while the dock travels, opening cleanly before tracking the cursor.

---

## 🛠️ Architecture

```mermaid
flowchart TD
    subgraph GNOME_Shell ["GNOME Shell (GJS / Mutter)"]
        D2D["Dash2Dock Enhanced Extension"]
        AGM["AppGridMagnifier.js (Overview Lens)"]
        DOT["DotCanvas (Cairo Glass Bead)"]
    end

    subgraph Rust_Engine ["Native Core (libmacdock_engine.so)"]
        GIR["GObject Introspection Typelib (GIR)"]
        PHYS["Physics Simulation (Squash & Stretch, Gravity)"]
        SPRING["SpringFollower (2nd-Order Damper)"]
        LENS["Cosine-Squared Lens Curve"]
    end

    Cursor["Mouse Cursor / Touch"] --> D2D
    Cursor --> AGM
    D2D -->|GObject Introspection| GIR
    GIR --> PHYS
    GIR --> SPRING
    GIR --> LENS
    PHYS -->|Transforms (X, Y, ScaleX, ScaleY)| D2D
    DOT -->|Cairo Repaint| D2D
```

---

## 🚀 Installation

### Prerequisites
Make sure you have Rust and standard build tools installed:
* **Arch Linux / Manjaro**:
  ```bash
  sudo pacman -S rust gobject-introspection base-devel
  ```
* **Fedora**:
  ```bash
  sudo dnf install rust cargo gobject-introspection-devel gcc
  ```
* **Ubuntu / Debian**:
  ```bash
  sudo apt install rustc cargo libgirepository1.0-dev build-essential
  ```

### Quick Install (Automated)
Clone the repository and run `install.sh`:
```bash
git clone https://github.com/besiple/macdock-gnome.git
cd macdock-gnome
chmod +x install.sh
./install.sh
```

The script will:
1. Compile `macdock-engine` in release mode.
2. Generate and install the typelib and shared library to system directories (`/usr/lib`).
3. Deploy the enhanced GNOME extension to `~/.local/share/gnome-shell/extensions/`.
4. Compile schemas and activate the extension immediately.

---

## 🗑️ Uninstallation

To remove MacDock GNOME and restore default behavior:
```bash
cd macdock-gnome
./uninstall.sh
```

---

## ⚙️ Configuration & Customization

You can fine-tune dock parameters through standard GNOME Extensions settings:
* **Magnification Max Scale**: Adjust lens zoom factor.
* **Bounce Height & Physics**: Set in extension preferences or adjust constants in `engine/src/physics.rs`.
* **Indicator Style**: Select "Dot" in Appearance settings to enjoy the illuminated glass bead.

---

## 📜 Credits & License

* Developed & crafted by [@besiple](https://github.com/besiple).
* Built upon the solid foundation of [dash2dock-lite](https://github.com/icedman/dash2dock-lite) by icedman.
* Licensed under the GNU General Public License v3.0 (GPL-3.0).

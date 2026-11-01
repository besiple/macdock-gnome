'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

const Point = Graphene.Point;
const TARGET_ICON_SIZE = 64; // Standard clean medium icon size (prevents 96px oversized icons)

// macOS Launchpad Focus Zoom parameters
const MAX_SCALE = 1.32;       // Clean, elegant hover zoom (+32%)
const EASE_DURATION = 140;    // Fluid cubic animation duration in ms

export class AppGridClean {
  constructor(extension) {
    this.extension = extension;
    this._enabled = false;
    this._overviewShowingId = null;
    this._overviewShownId = null;
    this._overviewHiddenId = null;
    this._dragBeginId = null;
    this._dragEndId = null;
    this._stateAdjId = null;
    this._viewLoadedId = null;
    this._patchedManagers = new Set();
    this._hoverSignals = [];
    this._pv = new Point();
    this._pv.x = 0.5;
    this._pv.y = 0.5;
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._overviewShowingId = Main.overview.connect('showing', () => {
      this._applyClean();
    });

    this._overviewShownId = Main.overview.connect('shown', () => {
      this._applyClean();
    });

    this._overviewHiddenId = Main.overview.connect('hidden', () => {
      this._resetMagnifier();
    });

    this._dragBeginId = Main.overview.connect('item-drag-begin', () => {
      this._resetMagnifier();
    });

    this._dragEndId = Main.overview.connect('item-drag-end', () => {
      this._resetMagnifier();
    });

    let controls = Main.overview._overview?.controls || Main.overview._overview?._controls;
    if (controls?._stateAdjustment) {
      this._stateAdjId = controls._stateAdjustment.connect('notify::value', () => {
        this._applyClean();
      });
    }

    let appDisplay = controls?.appDisplay || controls?._appDisplay;
    if (appDisplay) {
      this._viewLoadedId = appDisplay.connect('view-loaded', () => {
        this._applyClean();
      });
    }

    this._applyClean();
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    if (this._overviewShowingId) {
      Main.overview.disconnect(this._overviewShowingId);
      this._overviewShowingId = null;
    }
    if (this._overviewShownId) {
      Main.overview.disconnect(this._overviewShownId);
      this._overviewShownId = null;
    }
    if (this._overviewHiddenId) {
      Main.overview.disconnect(this._overviewHiddenId);
      this._overviewHiddenId = null;
    }
    if (this._dragBeginId) {
      Main.overview.disconnect(this._dragBeginId);
      this._dragBeginId = null;
    }
    if (this._dragEndId) {
      Main.overview.disconnect(this._dragEndId);
      this._dragEndId = null;
    }

    let controls = Main.overview._overview?.controls || Main.overview._overview?._controls;
    if (controls?._stateAdjustment && this._stateAdjId) {
      controls._stateAdjustment.disconnect(this._stateAdjId);
      this._stateAdjId = null;
    }

    let appDisplay = controls?.appDisplay || controls?._appDisplay;
    if (appDisplay && this._viewLoadedId) {
      appDisplay.disconnect(this._viewLoadedId);
      this._viewLoadedId = null;
    }

    this._disconnectHoverSignals();
    this._restoreAll();
  }

  _disconnectHoverSignals() {
    for (let entry of this._hoverSignals) {
      try {
        if (entry.item && entry.id) {
          entry.item.disconnect(entry.id);
          delete entry.item._cleanHoverConnected;
        }
      } catch (e) {}
    }
    this._hoverSignals = [];
  }

  _enforceLayoutManagerSize(lm, size = TARGET_ICON_SIZE) {
    if (!lm) return;
    try {
      lm.fixed_icon_size = size;
      lm.fixedIconSize = size;
      lm._iconSize = size;

      if (!lm._agmOrigFindBestIconSize) {
        lm._agmOrigFindBestIconSize = lm._findBestIconSize;
        lm._findBestIconSize = function() {
          return size;
        };
        this._patchedManagers.add(lm);
      }
    } catch (e) {
      console.log('[AppGridClean] _enforceLayoutManagerSize error:', e);
    }
  }

  _getTargetActor(it) {
    if (!it) return null;
    if (it.icon && it.icon._iconBin) return it.icon._iconBin;
    if (it.icon) return it.icon;
    return null;
  }

  _cleanItem(it, size = TARGET_ICON_SIZE) {
    if (!it) return;
    try {
      it._expandTitleOnHover = false;
      if (typeof it._updateMultiline === 'function' && !it._agmOrigMultiline) {
        it._agmOrigMultiline = it._updateMultiline;
        it._updateMultiline = () => {};
      }

      // Hide app name label completely
      if (it.icon && it.icon.label) {
        it.icon.label.visible = false;
        it.icon.label.opacity = 0;
      }

      // Enforce icon size (64px) so icons don't balloon to 96px
      if (it.icon && typeof it.icon.setIconSize === 'function') {
        if (it.icon.iconSize !== size) {
          it.icon.setIconSize(size);
        }
      }

      // Set center pivot point on the icon container for in-place zoom
      let targetActor = this._getTargetActor(it);
      if (targetActor) {
        targetActor.pivot_point = this._pv;
      }

      // Clear any background card / border / outline
      it.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
      if (it.icon) {
        it.icon.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
      }

      // Hook hover signal for macOS magnification lens
      if (!it._cleanHoverConnected) {
        it._cleanHoverConnected = true;
        let id = it.connect('notify::hover', () => this._onGridHoverChanged());
        this._hoverSignals.push({ item: it, id: id });
      }

      // If it is a folder icon, clean folder items and view too
      if (it.view) {
        if (it.view._grid?.layout_manager) {
          this._enforceLayoutManagerSize(it.view._grid.layout_manager, size);
        }
        if (typeof it.view.getAllItems === 'function') {
          let fItems = it.view.getAllItems();
          fItems.forEach(child => this._cleanItem(child, size));
        }
      }
    } catch (e) {}
  }

  _getAllVisibleItems(appDisplay) {
    let rawItems = [];
    try {
      if (typeof appDisplay.getAllItems === 'function') {
        rawItems = appDisplay.getAllItems();
      } else if (appDisplay._allItems) {
        rawItems = Array.from(appDisplay._allItems.values ? appDisplay._allItems.values() : appDisplay._allItems);
      } else if (appDisplay._grid && typeof appDisplay._grid.get_children === 'function') {
        rawItems = appDisplay._grid.get_children();
      }
      if (appDisplay._currentDialog?._view?.getAllItems) {
        rawItems = rawItems.concat(appDisplay._currentDialog._view.getAllItems());
      }
    } catch (e) {}
    return rawItems.filter(it => it && it.visible !== false);
  }

  _onGridHoverChanged() {
    if (!this._enabled) return;

    if (Main.overview.isDragging) {
      this._resetMagnifier();
      return;
    }

    let controls = Main.overview._overview?.controls || Main.overview._overview?._controls;
    let appDisplay = controls?.appDisplay || controls?._appDisplay;
    if (!appDisplay) return;

    let items = this._getAllVisibleItems(appDisplay);
    if (!items || items.length === 0) return;

    // Find the actively hovered item
    let hoveredItem = items.find(it => it && it.hover && it.is_mapped());
    if (!hoveredItem) {
      this._resetMagnifier(items);
      return;
    }

    // Smoothly scale the hovered icon up, and keep all others at 1.0 (no neighbor jitter)
    items.forEach(it => {
      let targetActor = this._getTargetActor(it);
      if (!targetActor) return;

      let targetScale = (it === hoveredItem) ? MAX_SCALE : 1.0;
      let currScale = targetActor.scale_x || 1.0;

      if (Math.abs(currScale - targetScale) > 0.01) {
        targetActor.remove_all_transitions();
        targetActor.ease({
          scale_x: targetScale,
          scale_y: targetScale,
          duration: EASE_DURATION,
          mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
      }
    });
  }

  _resetMagnifier(items) {
    if (!items) {
      let controls = Main.overview._overview?.controls || Main.overview._overview?._controls;
      let appDisplay = controls?.appDisplay || controls?._appDisplay;
      if (appDisplay) items = this._getAllVisibleItems(appDisplay);
    }
    if (!items) return;

    items.forEach(it => {
      if (!it) return;
      let targetActor = this._getTargetActor(it);
      if (targetActor) {
        targetActor.remove_all_transitions();
        targetActor.ease({
          scale_x: 1.0,
          scale_y: 1.0,
          duration: 150,
          mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
      }
    });
  }

  _applyClean() {
    try {
      let controls = Main.overview._overview?.controls || Main.overview._overview?._controls;
      if (!controls) return;
      let appDisplay = controls.appDisplay || controls._appDisplay;
      if (!appDisplay) return;

      // 1. Enforce icon size on the main grid layout manager
      if (appDisplay._grid?.layout_manager) {
        this._enforceLayoutManagerSize(appDisplay._grid.layout_manager, TARGET_ICON_SIZE);
      }

      // 2. Clean all app grid items & attach magnification hooks
      let rawItems = [];
      if (typeof appDisplay.getAllItems === 'function') {
        rawItems = appDisplay.getAllItems();
      } else if (appDisplay._allItems) {
        rawItems = Array.from(appDisplay._allItems.values ? appDisplay._allItems.values() : appDisplay._allItems);
      } else if (appDisplay._grid && typeof appDisplay._grid.get_children === 'function') {
        rawItems = appDisplay._grid.get_children();
      }

      rawItems.forEach(it => this._cleanItem(it, TARGET_ICON_SIZE));

      // 3. Clean folder dialog items if open
      if (appDisplay._currentDialog?._view) {
        if (appDisplay._currentDialog._view._grid?.layout_manager) {
          this._enforceLayoutManagerSize(appDisplay._currentDialog._view._grid.layout_manager, TARGET_ICON_SIZE);
        }
        let folderItems = appDisplay._currentDialog._view.getAllItems?.() ?? [];
        folderItems.forEach(it => this._cleanItem(it, TARGET_ICON_SIZE));
      }

      // 4. Hook folder dialogs
      if (appDisplay._folderIcons && Array.isArray(appDisplay._folderIcons)) {
        appDisplay._folderIcons.forEach(folder => {
          if (folder && folder._dialog && !folder._cleanHooked) {
            folder._cleanHooked = true;
            folder._dialog.connect('opened', () => {
              if (folder._dialog._view?._grid?.layout_manager) {
                this._enforceLayoutManagerSize(folder._dialog._view._grid.layout_manager, TARGET_ICON_SIZE);
              }
              let items = folder._dialog._view?.getAllItems?.() ?? [];
              items.forEach(it => this._cleanItem(it, TARGET_ICON_SIZE));
            });
          }
        });
      }
    } catch (err) {
      console.log('[AppGridClean] error:', err);
    }
  }

  _restoreAll() {
    try {
      // Restore patched layout managers
      for (const lm of this._patchedManagers) {
        try {
          if (lm._agmOrigFindBestIconSize) {
            lm._findBestIconSize = lm._agmOrigFindBestIconSize;
            delete lm._agmOrigFindBestIconSize;
          }
          lm.fixed_icon_size = -1;
          lm.fixedIconSize = -1;
        } catch (e) {}
      }
      this._patchedManagers.clear();

      let controls = Main.overview._overview?.controls || Main.overview._overview?._controls;
      if (!controls) return;
      let appDisplay = controls.appDisplay || controls._appDisplay;
      if (!appDisplay) return;

      let rawItems = [];
      if (typeof appDisplay.getAllItems === 'function') {
        rawItems = appDisplay.getAllItems();
      } else if (appDisplay._allItems) {
        rawItems = Array.from(appDisplay._allItems.values ? appDisplay._allItems.values() : appDisplay._allItems);
      } else if (appDisplay._grid && typeof appDisplay._grid.get_children === 'function') {
        rawItems = appDisplay._grid.get_children();
      }

      rawItems.forEach(it => {
        if (!it) return;
        try {
          if (it._agmOrigMultiline) {
            it._updateMultiline = it._agmOrigMultiline;
            delete it._agmOrigMultiline;
          }
          it._expandTitleOnHover = true;
          it.set_style(null);
          let targetActor = this._getTargetActor(it);
          if (targetActor) {
            targetActor.remove_all_transitions();
            targetActor.set_scale(1.0, 1.0);
          }
          if (it.icon) {
            it.icon.set_style(null);
            if (it.icon.label) {
              it.icon.label.visible = true;
              it.icon.label.opacity = 255;
            }
          }
          if (it.view && typeof it.view.getAllItems === 'function') {
            let fItems = it.view.getAllItems();
            fItems.forEach(child => {
              let childActor = this._getTargetActor(child);
              if (childActor) {
                childActor.remove_all_transitions();
                childActor.set_scale(1.0, 1.0);
              }
              if (child.icon && child.icon.label) {
                child.icon.label.visible = true;
                child.icon.label.opacity = 255;
              }
              child.set_style(null);
            });
          }
        } catch (e) {}
      });
    } catch (e) {}
  }
}

'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TARGET_ICON_SIZE = 64; // Standard clean medium icon size (prevents 96px oversized icons)

export class AppGridClean {
  constructor(extension) {
    this.extension = extension;
    this._enabled = false;
    this._overviewShowingId = null;
    this._overviewShownId = null;
    this._stateAdjId = null;
    this._viewLoadedId = null;
    this._patchedManagers = new Set();
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

    this._restoreAll();
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

      // Clear any background card / border / outline
      it.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
      if (it.icon) {
        it.icon.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
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

      // 2. Clean all app grid items
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

'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class AppGridClean {
  constructor(extension) {
    this.extension = extension;
    this._enabled = false;
    this._overviewShowingId = null;
    this._overviewShownId = null;
    this._stateAdjId = null;
    this._viewLoadedId = null;
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

  _cleanItem(it) {
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

      // Clear any inline styles or backgrounds
      it.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
      if (it.icon) {
        it.icon.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
      }

      // If it is a folder icon, clean folder items too
      if (it.view && typeof it.view.getAllItems === 'function') {
        let fItems = it.view.getAllItems();
        fItems.forEach(child => this._cleanItem(child));
      }
    } catch (e) {}
  }

  _applyClean() {
    try {
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

      rawItems.forEach(it => this._cleanItem(it));

      // Folder dialog items if currently open
      if (appDisplay._currentDialog?._view) {
        let folderItems = appDisplay._currentDialog._view.getAllItems?.() ?? [];
        folderItems.forEach(it => this._cleanItem(it));
      }

      // Hook dialog opening for folders
      if (appDisplay._folderIcons && Array.isArray(appDisplay._folderIcons)) {
        appDisplay._folderIcons.forEach(folder => {
          if (folder && folder._dialog && !folder._cleanHooked) {
            folder._cleanHooked = true;
            folder._dialog.connect('opened', () => {
              let items = folder._dialog._view?.getAllItems?.() ?? [];
              items.forEach(it => this._cleanItem(it));
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

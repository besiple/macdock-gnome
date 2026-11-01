'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class AppGridClean {
  constructor(extension) {
    this.extension = extension;
    this._enabled = false;
    this._overviewShowingId = null;
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._overviewShowingId = Main.overview.connect('showing', () => {
      this._applyClean();
    });

    if (Main.overview.visible || Main.overview.visibleTarget) {
      this._applyClean();
    }
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    if (this._overviewShowingId) {
      Main.overview.disconnect(this._overviewShowingId);
      this._overviewShowingId = null;
    }
    this._restoreAll();
  }

  _applyClean() {
    if (this._timer) {
      this.extension._loTimer.cancel(this._timer);
    }
    this._timer = this.extension._loTimer.runDebounced(() => {
      try {
        let controls = Main.overview._overview.controls || Main.overview._overview._controls;
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
            it.remove_all_transitions();
            it.set_scale(1.0, 1.0);
            it.translation_x = 0.0;
            it.translation_y = 0.0;

            // Strip grey background card / border / outline completely
            it.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
            if (it.icon) {
              it.icon.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
              if (it.icon._iconBin) {
                it.icon._iconBin.remove_all_transitions();
                it.icon._iconBin.set_scale(1.0, 1.0);
                it.icon._iconBin.translation_x = 0.0;
                it.icon._iconBin.translation_y = 0.0;
              }
            }

            // Disable multiline wrapping on hover
            it._expandTitleOnHover = false;
            if (typeof it._updateMultiline === 'function' && !it._agmOrigMultiline) {
              it._agmOrigMultiline = it._updateMultiline;
              it._updateMultiline = () => {};
            }

            // Completely hide app name text for clean minimal icons
            if (it.icon && it.icon.label) {
              it.icon.label.visible = false;
              it.icon.label.opacity = 0;
              it.icon.label.height = 0;
            }
          } catch (e) {}
        });
      } catch (err) {
        console.log('[AppGridClean] error:', err);
      }
    }, 100, 'appGridClean');
  }

  _restoreAll() {
    try {
      let controls = Main.overview._overview.controls || Main.overview._overview._controls;
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
          it.remove_all_transitions();
          it.set_scale(1.0, 1.0);
          it.translation_x = 0.0;
          it.translation_y = 0.0;
          it.set_style(null);
          if (it.icon) {
            it.icon.set_style(null);
            if (it.icon._iconBin) {
              it.icon._iconBin.remove_all_transitions();
              it.icon._iconBin.set_scale(1.0, 1.0);
            }
            if (it.icon.label) {
              it.icon.label.visible = true;
              it.icon.label.opacity = 255;
              it.icon.label.height = -1;
            }
          }
          if (it._agmOrigMultiline) {
            it._updateMultiline = it._agmOrigMultiline;
            delete it._agmOrigMultiline;
          }
          it._expandTitleOnHover = true;
        } catch (e) {}
      });
    } catch (e) {}
  }
}

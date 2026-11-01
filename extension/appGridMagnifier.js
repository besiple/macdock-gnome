'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
const Point = Graphene.Point;

export class AppGridMagnifier {
  constructor(extension) {
    this.extension = extension;
    this._enabled = false;
    this._items = [];
    this._hoverSignalIds = new Map();
    this._overviewShownId = null;
    this._overviewHiddenId = null;
    this._pv = new Point({ x: 0.5, y: 0.5 });
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._overviewShowingId = Main.overview.connect('showing', () => {
      this._setupAppGrid();
    });

    this._overviewHiddenId = Main.overview.connect('hidden', () => {
      this._resetAllItems();
    });

    if (Main.overview.visible || Main.overview.visibleTarget) {
      this._setupAppGrid();
    }
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    if (this._overviewShowingId) {
      Main.overview.disconnect(this._overviewShowingId);
      this._overviewShowingId = null;
    }
    if (this._overviewHiddenId) {
      Main.overview.disconnect(this._overviewHiddenId);
      this._overviewHiddenId = null;
    }

    this._disconnectHoverSignals();
    this._resetAllItems();
  }

  _setupAppGrid() {
    // Delay slightly to let AppDisplay settle its items
    if (this._setupTimer) {
      this.extension._loTimer.cancel(this._setupTimer);
    }
    this._setupTimer = this.extension._loTimer.runDebounced(() => {
      this._initItems();
    }, 120, 'setupAppGridMagnifier');
  }

  _disconnectHoverSignals() {
    for (let [item, id] of this._hoverSignalIds.entries()) {
      try {
        if (item && id) {
          item.disconnect(id);
        }
      } catch (e) {}
    }
    this._hoverSignalIds.clear();
  }

  _initItems() {
    try {
      this._disconnectHoverSignals();

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

      this._items = rawItems.filter(it => it && it.visible !== false);
      if (this._items.length === 0) return;

      // Sort items horizontally left-to-right
      this._items.sort((a, b) => {
        let posA = a.get_transformed_position();
        let posB = b.get_transformed_position();
        return posA[0] - posB[0];
      });

      this._items.forEach((it, index) => {
        it.remove_all_transitions();
        it.set_scale(1.0, 1.0);
        it.translation_x = 0.0;
        it.translation_y = 0.0;
        it.pivot_point = this._pv;

        // Completely strip ugly grey background card / border / outline
        it.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
        if (it.icon) {
          it.icon.set_style('background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
          if (it.icon._iconBin) {
            it.icon._iconBin.set_scale(1.0, 1.0);
            it.icon._iconBin.translation_x = 0.0;
            it.icon._iconBin.translation_y = 0.0;
          }
        }

        // Disable GNOME's multiline word-wrapping and tile height expansion
        it._expandTitleOnHover = false;
        if (typeof it._updateMultiline === 'function' && !it._agmOrigMultiline) {
          it._agmOrigMultiline = it._updateMultiline;
          it._updateMultiline = () => {};
        }

        // Completely hide the app name label for pure minimal aesthetic
        if (it.icon && it.icon.label) {
          it.icon.label.visible = false;
          it.icon.label.opacity = 0;
          it.icon.label.height = 0;
          if (it.icon.label.clutter_text) {
            it._origLabelText = it._origLabelText || it.icon.label.clutter_text.text;
            it.icon.label.clutter_text.text = '';
          }
        }

        // Connect hover notification
        let sigId = it.connect('notify::hover', () => {
          this._onItemHoverChanged(it, index);
        });
        this._hoverSignalIds.set(it, sigId);
      });
    } catch (err) {
      console.log('[AppGridMagnifier] _initItems error:', err);
    }
  }

  _onItemHoverChanged(hoveredItem, index) {
    if (!this._enabled || !this._items || this._items.length === 0) return;

    let anyHovered = false;
    let hoveredIdx = -1;

    for (let i = 0; i < this._items.length; i++) {
      if (this._items[i].hover) {
        anyHovered = true;
        hoveredIdx = i;
        break;
      }
    }

    if (anyHovered && hoveredIdx >= 0) {
      for (let i = 0; i < this._items.length; i++) {
        let it = this._items[i];
        let dist = Math.abs(i - hoveredIdx);

        it.remove_all_transitions();

        if (dist === 0) {
          // Hovered icon: major magnification (+38%)
          it.ease({
            scale_x: 1.38,
            scale_y: 1.38,
            duration: 140,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
          });
          if (it.get_parent()) {
            try {
              it.get_parent().set_child_above_sibling(it, null);
            } catch (e) {}
          }
        } else if (dist === 1) {
          // Direct neighbor: subtle organic bloom (+15%)
          it.ease({
            scale_x: 1.15,
            scale_y: 1.15,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
          });
        } else {
          // Rest of icons: smooth return to standard size
          it.ease({
            scale_x: 1.0,
            scale_y: 1.0,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
          });
        }
      }
    } else {
      // No icon is hovered: cleanly ease all icons back to standard scale
      for (let i = 0; i < this._items.length; i++) {
        let it = this._items[i];
        it.remove_all_transitions();
        it.ease({
          scale_x: 1.0,
          scale_y: 1.0,
          duration: 180,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
      }
    }
  }

  _resetAllItems() {
    if (this._items) {
      this._items.forEach(it => {
        try {
          if (it) {
            it.remove_all_transitions();
            it.set_scale(1.0, 1.0);
            it.translation_x = 0.0;
            it.translation_y = 0.0;
            if (it._origLabelText && it.icon && it.icon.label && it.icon.label.clutter_text) {
              it.icon.label.clutter_text.text = it._origLabelText;
              it.icon.label.visible = true;
              it.icon.label.opacity = 255;
            }
          }
        } catch (e) {}
      });
      this._items = [];
    }
  }
}

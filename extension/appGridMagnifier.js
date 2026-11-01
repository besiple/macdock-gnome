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
    this._ticker = null;
    this._stageMotionId = null;
    this._overviewShownId = null;
    this._overviewHiddenId = null;
    this._pv = new Point({ x: 0.5, y: 0.5 });
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._overviewShownId = Main.overview.connect('shown', () => {
      this._onOverviewShown();
    });

    this._overviewHiddenId = Main.overview.connect('hidden', () => {
      this._onOverviewHidden();
    });

    if (Main.overview.visible) {
      this._onOverviewShown();
    }
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    if (this._overviewShownId) {
      Main.overview.disconnect(this._overviewShownId);
      this._overviewShownId = null;
    }
    if (this._overviewHiddenId) {
      Main.overview.disconnect(this._overviewHiddenId);
      this._overviewHiddenId = null;
    }

    this._stopTracking();
    this._resetAllItems();
  }

  _onOverviewShown() {
    this._items = [];
    this._findItems();
    this._startTracking();
  }

  _onOverviewHidden() {
    this._stopTracking();
    this._resetAllItems();
  }

  _findItems() {
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

      this._items = rawItems.filter(it => it && it.visible !== false && it.is_mapped());

      this._items.forEach(it => {
        it._agmScale = 1.0;
        it._agmTargetScale = 1.0;
        it._baseCenterX = null;
        it._baseCenterY = null;

        it.set_scale(1.0, 1.0);
        it.translation_x = 0.0;
        it.translation_y = 0.0;
        it.pivot_point = this._pv;

        // Completely strip ugly grey background card / border / outline
        it.set_style('background-color: transparent !important; background: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
        if (it.icon) {
          it.icon.set_style('background-color: transparent !important; background: transparent !important; box-shadow: none !important; border: none !important; outline: none !important;');
        }

        // Disable GNOME's multiline word-wrapping and tile height expansion
        it._expandTitleOnHover = false;
        if (typeof it._updateMultiline === 'function' && !it._agmOrigMultiline) {
          it._agmOrigMultiline = it._updateMultiline;
          it._updateMultiline = () => {};
        }

        // Completely hide the app name label for clean minimal aesthetic
        if (it.icon && it.icon.label) {
          it.icon.label.visible = false;
          it.icon.label.opacity = 0;
          it.icon.label.height = 0;
          if (it.icon.label.clutter_text) {
            it._origLabelText = it._origLabelText || it.icon.label.clutter_text.text;
            it.icon.label.clutter_text.text = '';
          }
        }
      });
    } catch (err) {
      console.log('[AppGridMagnifier] _findItems error:', err);
    }
  }

  _startTracking() {
    if (this._stageMotionId) return;

    this._stageMotionId = global.stage.connect('captured-event', (actor, event) => {
      if (event.type() === Clutter.EventType.MOTION) {
        let [px, py] = event.get_coords();
        this._onPointerMotion(px, py);
      }
      return Clutter.EVENT_PROPAGATE;
    });
  }

  _stopTracking() {
    if (this._stageMotionId) {
      global.stage.disconnect(this._stageMotionId);
      this._stageMotionId = null;
    }
    this._stopTicker();
  }

  _onPointerMotion(px, py) {
    if (!this._items || this._items.length === 0) {
      this._findItems();
      if (!this._items || this._items.length === 0) return;
    }

    let radius = 220.0;     // Horizontal lens influence radius
    let vTolerance = 140.0; // Vertical band tolerance
    let maxZoom = 0.38;     // +38% magnification at peak
    let needsMotion = false;

    for (let i = 0; i < this._items.length; i++) {
      let item = this._items[i];
      if (!item.is_mapped()) continue;

      // Lock resting center once so scaling never causes coordinate drift
      if (item._baseCenterX === null || item._baseCenterX === undefined) {
        let pos = item.get_transformed_position();
        if (isNaN(pos[0]) || isNaN(pos[1])) continue;
        item._baseCenterX = pos[0] + (item.width * (item.scale_x || 1.0)) / 2;
        item._baseCenterY = pos[1] + (item.height * (item.scale_y || 1.0)) / 2;
      }

      let dx = Math.abs(px - item._baseCenterX);
      let dy = Math.abs(py - item._baseCenterY);

      if (dx < radius && dy < vTolerance) {
        let u = dx / radius;
        let bell = Math.cos(u * Math.PI * 0.5);
        let intensity = bell * bell;

        let vNorm = dy / vTolerance;
        let vFactor = Math.cos(vNorm * Math.PI * 0.5);
        intensity *= (vFactor * vFactor);

        item._agmTargetScale = 1.0 + maxZoom * intensity;
      } else {
        item._agmTargetScale = 1.0;
      }

      if (item._agmTargetScale !== 1.0 || (item._agmScale && item._agmScale !== 1.0)) {
        needsMotion = true;
      }
    }

    if (needsMotion) {
      this._startTicker();
    }
  }

  _startTicker() {
    if (this._ticker) return;

    this._ticker = this.extension._hiTimer.runLoop(() => {
      this._step();
    }, 16, 'appGridMagnifier');
  }

  _stopTicker() {
    if (this._ticker) {
      this.extension._hiTimer.cancel(this._ticker);
      this._ticker = null;
    }
  }

  _step() {
    if (!this._items || this._items.length === 0) {
      this._stopTicker();
      return;
    }

    let stillMoving = false;
    let lerpSpeed = 0.22;

    for (let i = 0; i < this._items.length; i++) {
      let item = this._items[i];
      if (!item) continue;

      let currS = item._agmScale !== undefined ? item._agmScale : 1.0;
      let targS = item._agmTargetScale !== undefined ? item._agmTargetScale : 1.0;
      let diffS = targS - currS;

      if (Math.abs(diffS) > 0.002) {
        stillMoving = true;
        currS += diffS * lerpSpeed;
      } else {
        currS = targS;
      }

      item._agmScale = currS;

      // Pure in-place scaling: centered on icon, no translation
      item.pivot_point = this._pv;
      item.set_scale(currS, currS);
      item.translation_x = 0.0;
      item.translation_y = 0.0;

      // Bring actively magnified icon to the top of its layer
      if (currS > 1.06 && item.get_parent()) {
        try {
          item.get_parent().set_child_above_sibling(item, null);
        } catch (e) {}
      }
    }

    if (!stillMoving) {
      this._stopTicker();
    }
  }

  _resetAllItems() {
    if (this._items) {
      this._items.forEach(it => {
        try {
          if (it) {
            it._agmScale = 1.0;
            it._agmTargetScale = 1.0;
            it._baseCenterX = null;
            it._baseCenterY = null;
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

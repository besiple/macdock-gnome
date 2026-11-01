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
    this._overviewShowingId = null;
    this._overviewHiddenId = null;
    this._pv = new Point({ x: 0.5, y: 0.5 });
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._overviewShowingId = Main.overview.connect('showing', () => {
      this._onOverviewShowing();
    });

    this._overviewHiddenId = Main.overview.connect('hidden', () => {
      this._onOverviewHidden();
    });

    // If overview is already open when enabled
    if (Main.overview.visible || Main.overview.visibleTarget) {
      this._onOverviewShowing();
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

    this._stopTracking();
    this._resetAllItems();
  }

  _onOverviewShowing() {
    this._items = [];
    if (this._findItemsTimer) {
      this.extension._loTimer.cancel(this._findItemsTimer);
    }
    // Delay slightly to let AppDisplay finish layout
    this._findItemsTimer = this.extension._loTimer.runDebounced(() => {
      this._findItems();
      this._startTracking();
    }, 150, 'findAppGridItems');
  }

  _onOverviewHidden() {
    if (this._findItemsTimer) {
      this.extension._loTimer.cancel(this._findItemsTimer);
      this._findItemsTimer = null;
    }
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

      this._items = rawItems.filter(it => it && it.visible !== false);

      this._items.forEach(it => {
        it._agmScale = it._agmScale || 1.0;
        it._agmTargetScale = 1.0;
        it._agmSpreadX = it._agmSpreadX || 0.0;
        it._agmTargetSpreadX = 0.0;

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

        // Completely hide the app name label for pure minimal aesthetic
        if (it.icon && it.icon.label) {
          it.icon.label.visible = false;
          it.icon.label.opacity = 0;
          it.icon.label.height = 0;
        }

        // Set pivot point centered on the icon
        it.pivot_point = this._pv;
        if (it.icon && it.icon._iconBin) {
          it.icon._iconBin.pivot_point = this._pv;
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

    let radius = 250.0;     // Horizontal lens influence radius
    let vTolerance = 140.0; // Vertical band tolerance
    let maxZoom = 0.38;     // +38% magnification at peak
    let maxSpread = 20.0;   // Horizontal push between neighbors

    let needsMotion = false;

    for (let i = 0; i < this._items.length; i++) {
      let item = this._items[i];
      if (!item.is_mapped()) continue;

      let pos = item.get_transformed_position();
      if (isNaN(pos[0]) || isNaN(pos[1])) continue;

      let cx = pos[0] + item.width / 2;
      let cy = pos[1] + item.height / 2;

      let dx = px - cx;
      let dy = Math.abs(py - cy);

      if (dy < vTolerance) {
        let distH = Math.abs(dx);
        if (distH < radius) {
          let u = distH / radius;
          let bell = Math.cos(u * Math.PI * 0.5);
          let intensity = bell * bell;

          let vNorm = dy / vTolerance;
          let vFactor = Math.cos(vNorm * Math.PI * 0.5);
          intensity *= (vFactor * vFactor);

          item._agmTargetScale = 1.0 + maxZoom * intensity;
          item._agmTargetSpreadX = (cx >= px ? 1 : -1) * maxSpread * intensity;
        } else {
          item._agmTargetScale = 1.0;
          item._agmTargetSpreadX = 0.0;
        }
      } else {
        item._agmTargetScale = 1.0;
        item._agmTargetSpreadX = 0.0;
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

      let currX = item._agmSpreadX !== undefined ? item._agmSpreadX : 0.0;
      let targX = item._agmTargetSpreadX !== undefined ? item._agmTargetSpreadX : 0.0;
      let diffX = targX - currX;

      if (Math.abs(diffS) > 0.003 || Math.abs(diffX) > 0.3) {
        stillMoving = true;
        currS += diffS * lerpSpeed;
        currX += diffX * lerpSpeed;
      } else {
        currS = targS;
        currX = targX;
      }

      item._agmScale = currS;
      item._agmSpreadX = currX;

      // Scale the icon cleanly around center pivot
      item.pivot_point = this._pv;
      item.set_scale(currS, currS);
      item.translation_x = currX;

      // Bring actively magnified icon to the top of its layer
      if (currS > 1.08 && item.get_parent()) {
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
            it._agmSpreadX = 0.0;
            it._agmTargetSpreadX = 0.0;
            it.set_scale(1.0, 1.0);
            it.translation_x = 0.0;
          }
        } catch (e) {}
      });
      this._items = [];
    }
  }
}

'use strict';

import MacDockEngine from 'gi://MacDockEngine?version=1.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
const Point = Graphene.Point;

import { Dot } from './apps/dot.js';
import { DockPosition } from './dock.js';
import { Vector } from './vector.js';

import { DockItemDotsOverlay, DockItemBadgeOverlay } from './dockItems.js';
import {
  Bounce,
  Linear,
  CubicEaseOut,
  QuadraticEaseOut,
} from './effects/easing.js';
import {
  get_distance_sqr,
  get_distance,
  isInRect,
  isOverlapRect,
} from './utils.js';

const ANIM_POSITION_PER_SEC = 550 / 1000;
const ANIM_SIZE_PER_SEC = 250 / 1000;
const ANIM_ICON_RAISE = 0.5;
const ANIM_ICON_SCALE = 1.5;
const ANIM_ICON_HIT_AREA = 2.5;
const ANIMATE_CACHE_LOOKUP = 4;

const DOT_CANVAS_SIZE = 96;

export let Animator = class {
  enable() {
    if (!this._renderers) {
      if (!this._rustEngine) { this._rustEngine = MacDockEngine.create(0); }
      this._renderers = [];
      this._dots = [];
      this._badges = [];
    }
    this._computed = null;
  }

  isAnimating() {
    if (!this._rustEngine) return false;
    return MacDockEngine.is_animating(this._rustEngine);
  }

  disable() {
    if (this._target) {
      if (this._rustEngine) { MacDockEngine.destroy(this._rustEngine); this._rustEngine = 0; }
      this._target.remove_all_children();
    }
    if (!this._renderers) {
      this._renderers = [];
      this._dots = [];
      this._badges = [];
    }
  }

  _precreateResources(dock) {
    if (!dock._icons) {
      return false;
    }

    let count = dock._icons.length;
    if (dock.renderArea.get_children().length == 0) {
      this._renderers = [];
      this._dots = [];
      this._badges = [];
    }
    this._target = dock.renderArea;

    while (this._renderers.length < count) {
      // renderer
      let target = dock.renderArea;
      let renderer = new St.Icon({
        icon_name: 'file',
        name: 'd2daIcon',
        reactive: true,
        icon_size: 24,
      });
      renderer.visible = false;
      target.add_child(renderer);
      this._renderers.push(renderer);

      // dot
      let dots = new DockItemDotsOverlay(new Dot(DOT_CANVAS_SIZE));
      dots.visible = false;
      target.add_child(dots);
      this._dots.push(dots);

      // badges
      let badge = new DockItemBadgeOverlay(new Dot(DOT_CANVAS_SIZE));
      badge.visible = false;
      target.add_child(badge);
      this._badges.push(badge);
    }

    for (let i = dock._icons.length; i < this._renderers.length; i++) {
      this._renderers[i].visible = false;
      this._dots[i].visible = false;
      this._badges[i].visible = false;
    }

    return true;
  }

  //! begin optimization
  animate(dt) {
    let dock = this.dock;
    if (dock._hoveredIcon) {
      dock._lastHoveredIcon = dock._hoveredIcon;
    }

    let simulation = false;

    if (!dock.layout()) {
      console.log('unable to layout()');
      return;
    }

    if (!this._precreateResources(dock)) {
      return;
    }

    // opacity
    let didFadeIn = false;
    if (dock.opacity < 255) {
      let opacityPerSecond = 255 / 500;
      didFadeIn = true;
      let dst = 255 - dock.opacity;
      let mag = Math.abs(dst);
      let dir = Math.sign(dst);
      if (opacityPerSecond > mag / dt) {
        opacityPerSecond = mag / dt;
      }
      dock.opacity += Math.floor(opacityPerSecond * dt * dir);
      if (dock.renderArea.opacity < 255 && dock.opacity > 50) {
        dock.renderArea.opacity = dock.opacity;
      }
    }

    let m = dock.getMonitor();
    let pointer = global.get_pointer();

    // simulated or transformed pointers
    if (dock.extension.simulated_pointer) {
      pointer = [...dock.extension.simulated_pointer];
      simulation = true;
    }
    if (dock.simulated_pointer) {
      pointer = [...dock.simulated_pointer];
      simulation = true;
    }
    // disable icon scale animation upon hovering an item
    if (
      dock._list &&
      dock._list.visible &&
      dock._list._box &&
      dock._lastHoveredIcon == dock._list._target
    ) {
      pointer[1] -= dock._iconSize * dock._scaleFactor;
    }

    let [px, py] = pointer;

    let vertical = dock.isVertical();
    let isWithin = dock._isWithinDash([px, py]);

    if (m.inFullscreen) {
      isWithin = false;
    }

    let animated = isWithin;
    dock.animated = animated;

    let animateIcons = dock._icons;
    let iconSize = dock._iconSizeScaledDown;
    let scaleFactor = dock._scaleFactor;

    let nearestIdx = -1;
    let nearestIcon = null;
    let nearestDistance = -1;

    let iconCenterOffset = (iconSize * scaleFactor) / 2;
    let hitArea = iconSize * ANIM_ICON_HIT_AREA * scaleFactor;
    hitArea *= hitArea;

    let idx = 0;
    let prevIcon = null;
    animateIcons.forEach((icon) => {
      if (!icon._icon) return;
      let pos = icon.get_transformed_position();

      if (icon._found && !icon._handled) {
        icon._handled = true;
        dock._maybeBounce(icon, true);
      }

      icon._pos = [...pos];
      icon._fixedPosition = [...pos];

      // get nearest
      let bposcenter = [...pos];
      bposcenter[0] += iconCenterOffset;
      bposcenter[1] += iconCenterOffset;
      let dst = get_distance_sqr(pointer, bposcenter);

      if (
        isWithin &&
        (nearestDistance == -1 || nearestDistance > dst) &&
        dst < hitArea
      ) {
        nearestDistance = dst;
        nearestIcon = icon;
        nearestIdx = idx;
        icon._distance = dst;
      }

      icon._target = pos;
      icon._targetScale = 1;

      icon._idx = idx++;

      icon._prev = prevIcon;
      icon._next = null;
      if (prevIcon) {
        icon._next = icon;
      }
      prevIcon = icon;
    });

    let noAnimation = !dock.extension.animate_icons_unmute;
    if (dock._dragging) {
      noAnimation = true;
      isWithin = true;
    }
    if ((!simulation && !isWithin) || noAnimation) {
      nearestIcon = null;
    }
    dock._nearestIcon = nearestIcon;

    //---------------------------------------------------------
    // RUST MACDOCK ENGINE INTEGRATION
    let edge_distance = dock._edge_distance || 0;
    if (animated && edge_distance < 0) {
      edge_distance = 0;
    }
    let magnify = dock.extension.animation_magnify * ANIM_ICON_SCALE;
    let rise = dock.extension.animation_rise * ANIM_ICON_RAISE;
    let slowDown = dock.extension._config?.speed_up || 1;
    let didScale = isWithin;
    let didBounce = false;

    //---------------------------------------------------------
    if (!this._rustEngine) {
      this._rustEngine = MacDockEngine.create(0);
    }

    let count = animateIcons.length;
    MacDockEngine.set_icon_count(this._rustEngine, count);

    let baseSize = iconSize * scaleFactor;
    let magnifyVal = dock.extension.animation_magnify;
    let maxScale = 1.0 + magnifyVal * 1.8;
    let radius = (baseSize + 12) * 2.6;
    let spacing = 8.0 * scaleFactor;
    MacDockEngine.set_config(this._rustEngine, baseSize, maxScale, radius, spacing);

    // Compute pointer relative to dock center
    let dockBox = dock.get_allocation_box();
    let dockCenterX = (dockBox.x1 + dockBox.x2) / 2;
    let dockCenterY = (dockBox.y1 + dockBox.y2) / 2;
    let relPointer = vertical ? (py - dockCenterY) : (px - dockCenterX);
    let currTranslationDist = vertical ? Math.abs(dock.dash.translationX || 0) : Math.abs(dock.dash.translationY || 0);
    let isPointerInside = isWithin && !m.inFullscreen && dock.extension.animate_icons_unmute && !dock._dragging && !dock._hidden && (currTranslationDist < 12.0);

    let proximity = 0.0;
    if (isPointerInside) {
      // Smooth cosine-squared entry falloff based on vertical proximity to dock baseline
      let distAbove = 0.0;
      if (dock._position === DockPosition.BOTTOM) {
        distAbove = Math.max(0, dockBox.y1 - py);
      } else if (dock._position === DockPosition.TOP) {
        distAbove = Math.max(0, py - dockBox.y2);
      } else if (dock._position === DockPosition.LEFT) {
        distAbove = Math.max(0, px - dockBox.x2);
      } else if (dock._position === DockPosition.RIGHT) {
        distAbove = Math.max(0, dockBox.x1 - px);
      }

      if (distAbove <= 2.0) {
        proximity = 1.0;
      } else if (distAbove < 40.0) {
        let norm = distAbove / 40.0;
        let f = Math.cos(norm * Math.PI * 0.5);
        proximity = f * f;
      } else {
        proximity = 0.0;
      }
    }

    MacDockEngine.update_pointer_proximity(this._rustEngine, relPointer, proximity);
    MacDockEngine.step(this._rustEngine, (dt || 16) / 1000.0);

    let hoveredIcon = null;
    let largestScale = 1.01;

    let isTopOrLeft = dock._position === DockPosition.TOP || dock._position === DockPosition.LEFT;
    let riseDirection = isTopOrLeft ? 1 : -1;

    let totalUnmagW = count * baseSize + (count - 1) * spacing;
    let startUnmagX = -totalUnmagW * 0.5 + baseSize * 0.5;

    for (let i = 0; i < count; i++) {
      let icon = animateIcons[i];
      if (!icon._icon) continue;

      let scaleX = MacDockEngine.get_icon_scale_x(this._rustEngine, i);
      let scaleY = MacDockEngine.get_icon_scale_y(this._rustEngine, i);
      let riseY = MacDockEngine.get_icon_y(this._rustEngine, i);
      let newX = MacDockEngine.get_icon_x(this._rustEngine, i);
      let origX = startUnmagX + i * (baseSize + spacing);
      let deltaSpread = newX - origX;

      if (scaleX > largestScale) {
        largestScale = scaleX;
        hoveredIcon = icon;
      }

      icon._scale = scaleX;
      icon._scaleY = scaleY;
      icon._targetScale = scaleX;
      icon._targetSize = baseSize * scaleX;
      icon._deltaSpread = deltaSpread;
      icon._riseY = riseY;

      // Used by separator positioning
      icon._icon.translationX = vertical ? 0 : deltaSpread;
      icon._icon.translationY = vertical ? deltaSpread : 0;
    }

    dock._hoveredIcon = hoveredIcon;
    let first = animateIcons[0];
    let last = animateIcons[animateIcons.length - 1];
    let renderOffset = dock.renderArea.get_transformed_position();
    
    //--------------
    // renderer
    //--------------
    animateIcons.forEach((icon) => {
      if (!icon._icon) return;
      // dock.renderArea.opacity = 100;
      {
        let icon_name = icon._icon.icon_name;
        let app_name =
          icon._appwell?.app?.app_info?.get_id()?.replace('.desktop', '') ??
          null;
        let gicon = null;

        // override icons here
        if (dock.extension.icon_map || dock.extension.app_map) {
          // override via icon name
          if (
            dock.extension.icon_map_cache &&
            dock.extension.icon_map_cache[icon_name]
          ) {
            gicon = dock.extension.icon_map_cache[icon_name];
          }
          if (
            !gicon &&
            dock.extension.icon_map &&
            dock.extension.icon_map[icon_name]
          ) {
            icon_name = dock.extension.icon_map[icon_name];
          }

          // override via app name
          if (
            app_name &&
            dock.extension.app_map_cache &&
            dock.extension.app_map_cache[app_name]
          ) {
            gicon = dock.extension.app_map_cache[app_name];
          }
          if (
            !gicon &&
            dock.extension.app_map &&
            app_name &&
            dock.extension.app_map[app_name]
          ) {
            icon_name = dock.extension.app_map[app_name];
          }
        }

        icon._renderer = this._renderers[icon._idx];
        icon._renderer._icon = icon._icon;
        icon._renderer.set_style_class_name('');

        if (!icon._appwell?._bounce) {
          icon._renderer.translationY = 0;
        }

        let renderer = icon._renderer;
        if (gicon) {
          // apply override
          renderer.gicon = gicon;

          // replace PNG with override SVG
          if (icon._icon.gicon && icon._icon.gicon.file && gicon) {
            icon._icon.gicon = gicon;
          }
        } else {
          if (icon_name) {
            renderer.icon_name = icon_name;
          } else {
            if (icon._icon.gicon) {
              // Directly assign the icon's gicon to the renderer (fixed in #issue 188)
              renderer.gicon = icon._icon.gicon;
            }
          }
        }

        //-------------------
        // scale & position from Rust engine
        //-------------------
        let unscaledIconSize = dock._iconSizeScaledDown * scaleFactor;
        let scaleX = icon._scale || 1.0;
        let scaleY = icon._scaleY || icon._scale || 1.0;

        let baseSize = 32 * (dock.extension.icon_quality || 1);
        if (renderer.icon_size != baseSize) {
          renderer.set_size(baseSize, baseSize);
          renderer.set_icon_size(baseSize);
        }

        let scaleToTargetX = (unscaledIconSize * scaleX) / baseSize;
        let scaleToTargetY = (unscaledIconSize * scaleY) / baseSize;
        renderer.set_scale(scaleToTargetX, scaleToTargetY);

        let p = icon.get_transformed_position();
        if (!isNaN(p[0]) && !isNaN(p[1])) {
          let renderedW = unscaledIconSize * scaleX;
          let renderedH = unscaledIconSize * scaleY;

          let slotCenterX = p[0] + icon.width / 2;
          let slotCenterY = p[1] + icon.height / 2;

          let screenCenterX = slotCenterX;
          let screenCenterY = slotCenterY;

          let rise = icon._riseY || 0;
          let spread = icon._deltaSpread || 0;

          if (vertical) {
            screenCenterY += spread;
            let dir = dock._position === DockPosition.LEFT ? 1 : -1;
            screenCenterX += dir * rise;
            let pinFactor = Math.max(0.0, 1.0 - rise / 25.0);
            if (dock._position === DockPosition.LEFT) {
              screenCenterX += (unscaledIconSize / 2) * (scaleX - 1.0) * pinFactor;
            } else {
              screenCenterX -= (unscaledIconSize / 2) * (scaleX - 1.0) * pinFactor;
            }
          } else {
            screenCenterX += spread;
            let dir = dock._position === DockPosition.TOP ? 1 : -1;
            screenCenterY += dir * rise;
            let pinFactor = Math.max(0.0, 1.0 - rise / 25.0);
            if (dock._position === DockPosition.BOTTOM) {
              screenCenterY += (unscaledIconSize / 2) * (1.0 - scaleY) * pinFactor;
            } else {
              screenCenterY -= (unscaledIconSize / 2) * (1.0 - scaleY) * pinFactor;
            }
          }

          let rx = screenCenterX - renderedW / 2 - renderOffset[0];
          let ry = screenCenterY - renderedH / 2 - renderOffset[1];

          renderer.set_position(rx, ry);
          renderer.visible = true;

          icon._px = p[0] - renderOffset[0];
          icon._py = p[1] - renderOffset[1];
          icon._slotCenterX = slotCenterX;
          icon._slotCenterY = slotCenterY;
          icon._screenCenterX = screenCenterX;
          icon._screenCenterY = screenCenterY;
        }

        let hideLabel = true;

        // label
        if (
          icon === hoveredIcon &&
          icon._label &&
          icon._label.text &&
          icon._label.text.length
        ) {
          let tSize = renderer.get_transformed_size();
          // let tPos = icon._icon.get_transformed_position();
          let tPos = renderer.get_transformed_position();
          if (isNaN(tPos[0]) || isNaN(tPos[1])) {
            tPos[0] = 0;
            tPos[1] = 0;
          }
          let sw = !isNaN(tSize[0]) ? tSize[0] : 0;
          let sh = !isNaN(tSize[1]) ? tSize[1] : 0;

          if (this._dwellIcon === icon) {
            this._dwellTick += dt;
            if (this._dwellTick > 450 && icon._targetScale > 1) {
              try {
                hideLabel = false;
                if (icon._label.opacity < 255 - 25) {
                  icon._label.opacity += 25;
                } else {
                  icon._label.opacity = 255;
                }
              } catch (err) {
                // label not ready?
              }
            }
          } else {
            this._dwellTick = 0;
          }
          this._dwellIcon = icon;

          // icon._label.style = 'font-size: 32pt';
          // icon._label.set_scale(0.5, 0.5);
          let lsz = icon._label.get_transformed_size();
          if (!isNaN(lsz[0]) && !isNaN(lsz[1])) {
            icon._label.x = tPos[0] + sw / 2 - lsz[0] / 2;
            icon._label.y = tPos[1] + sh / 2 - lsz[1] / 2;
            if (vertical) {
              if (dock._position == DockPosition.LEFT) {
                icon._label.x += sh / 1.5 + icon._label.width / 2;
              } else {
                icon._label.x -= sh / 1.5 + icon._label.width / 2;
              }
              icon._label.y += 2 * (m.geometry_scale || 1);
            } else {
              if (magnify == 0 || dock._iconSize <= 4) {
                sh *= 1.5;
              }
              if (dock._position == DockPosition.BOTTOM) {
                icon._label.y -= sh / 1.25;
              } else {
                icon._label.y += sh / 1.25;
              }
              icon._label.x += 2 * (m.geometry_scale || 1);
            }
          }
        }

        if (hideLabel && icon._label) {
          icon._label.opacity = 0;
        }

        //! todo... add placeholder opacity when dragging
        renderer.opacity =
          icon._icon == dock._dragged && dock._dragging ? 75 : 255;
      }



      // badges
      //! ***badge location at scaling is messed up***
      let badge = this._badges[icon._idx];
      badge.hide();
      if (icon != dock._dragged) {
        let appNotices = icon._appwell
          ? dock.extension.services._appNotices[icon._appwell.app.get_id()]
          : null;
        let noticesCount = 0;
        if (appNotices) {
          noticesCount = appNotices.count;
        }
        // noticesCount = 1;
        let target = dock.renderArea;
        if (badge && noticesCount > 0) {
          badge.update(icon, {
            noticesCount,
            position: dock._position,
            vertical,
            extension: dock.extension,
          });
          // badge.x = icon._renderer.x + 3 * icon._scale;
          // badge.y = icon._renderer.y - 3 * icon._scale;

          // if (dock._position == DockPosition.TOP) {
          //   badge.y = icon._renderer.y + (icon.height - 6) * icon._scale;
          // }

          badge.width = icon._renderer.width * icon._renderer.scaleX;
          badge.height = badge.width;
          badge.x = icon._renderer.x;
          badge.y = icon._renderer.y;

          badge.set_scale(icon._scale, icon._scale);
          badge.show();
        }
      }

      // dots
      //! ***dot requires a little more aligning at dock position other than bottom***
      let dots = this._dots[icon._idx];
      dots.hide();
      if (
        icon != dock._dragged &&
        icon._appwell &&
        icon._appwell.app &&
        icon._appwell.app.get_n_windows
      ) {
        let appCount = dock.getAppWindowsFiltered(icon._appwell.app).length;
        // appCount = 1;
        if (dots && appCount > 0) {
          dots.update(icon, {
            appCount,
            position: dock._position,
            vertical,
            extension: dock.extension,
            dock,
          });

          // macOS running indicator: stays stationary on the dock glass shelf (never bounces with the icon)
          let unscaledIconSize = dock._iconSizeScaledDown * scaleFactor;
          dots.width = unscaledIconSize;
          dots.height = unscaledIconSize;

          if (vertical) {
            let cx = icon._slotCenterX !== undefined ? icon._slotCenterX : (icon._px + renderOffset[0] + icon.width / 2);
            let cy = icon._screenCenterY !== undefined ? icon._screenCenterY : (icon._py + renderOffset[1] + icon.height / 2);
            dots.x = cx - dots.width / 2 - renderOffset[0];
            dots.y = cy - dots.height / 2 - renderOffset[1];
          } else {
            let cx = icon._screenCenterX !== undefined ? icon._screenCenterX : (icon._px + renderOffset[0] + icon.width / 2);
            let cy = icon._slotCenterY !== undefined ? icon._slotCenterY : (icon._py + renderOffset[1] + icon.height / 2);
            dots.x = cx - dots.width / 2 - renderOffset[0];
            dots.y = cy - dots.height / 2 - renderOffset[1];
          }

          dots.set_scale(1.0, 1.0);
          dots.show();
        }
      }

      // custom icons
      if (dock.extension.services) {
        dock.extension.services.updateIcon(icon, {
          scaleFactor,
          iconSize,
          dock,
        });
      }
    });

    // separators
    dock._separators.forEach((actor) => {
      let prev = actor._prev; // get_previous_sibling() || actor._prev;
      let next = actor._next; // get_next_sibling();
      if (prev && next && prev._icon && next._icon) {
        actor.translationX =
          (prev._icon.translationX + next._icon.translationX) / 2;
        actor.translationY =
          (prev._icon.translationY + next._icon.translationY) / 2;
        let thickness = dock.extension.separator_thickness || 0;
        if (vertical) {
          actor.width = iconSize * 0.5 * scaleFactor;
          actor.height = thickness + 0.5;
        } else {
          actor.width = thickness + 0.5;
          actor.height = iconSize * 0.75 * scaleFactor;
        }
        actor.visible = thickness > 0;
      }

      let any = next ?? prev;
      if (!vertical && any) {
        actor.translationY = any.height / 2 - actor.height / 2;
      } else if (vertical && any) {
        // actor.translationX = any.width / 2 - actor.width / 2;
      }
    });

    let targetX = 0;
    let targetY = 0;
    if (dock._hidden && dock.extension.autohide_dash) {
      if (isWithin) {
        dock.slideIn();
      }
    }

    const edgeDirectionMultiplier =
      dock._position == DockPosition.BOTTOM ||
      dock._position == DockPosition.RIGHT
        ? 1
        : -1;

    // if (!animated && !dock._hidden && dock.extension.peek_hidden_icons) {
    //   edge_distance = -dock._iconSizeScaledDown * scaleFactor / 1.5;
    // }

    //-------------------
    // animate slide in slide out
    //-------------------
    if (dock._hidden) {
      if (vertical) {
        if (dock._position == DockPosition.LEFT) {
          targetX =
            -(dock._background.width + edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        } else {
          targetX =
            (dock._background.width - edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        }
      } else {
        if (dock._position == DockPosition.BOTTOM) {
          targetY =
            (dock._background.height - edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        } else {
          targetY =
            -(dock._background.height + edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        }
      }
    }

    // edge
    if (vertical) {
      targetX += edge_distance * -edgeDirectionMultiplier;
    } else {
      targetY += edge_distance * -edgeDirectionMultiplier;
    }

    // dock translation: velvet spring physics + 3D spatial depth + optical dissolve
    {
      if (dock._autohideVelocityX === undefined) dock._autohideVelocityX = 0;
      if (dock._autohideVelocityY === undefined) dock._autohideVelocityY = 0;

      let isHiding = dock._hidden;
      let userSpeed = Math.max(0.2, Math.min(2.0, (dock.extension.autohide_speed || 0.5) * 2.0));
      // Velvety spring constants
      let omega = (isHiding ? 13.5 : 17.0) * userSpeed;
      let damping = isHiding ? 1.05 : 0.88;

      let frameDt = Math.max(0.004, Math.min(0.05, (dt || 16) / 1000.0));
      let subDt = frameDt / 4.0;
      let currX = dock.dash.translationX || 0;
      let currY = dock.dash.translationY || 0;
      let velX = dock._autohideVelocityX || 0;
      let velY = dock._autohideVelocityY || 0;

      for (let s = 0; s < 4; s++) {
        let diffX = currX - targetX;
        let accelX = -(omega * omega) * diffX - 2.0 * damping * omega * velX;
        velX += accelX * subDt;
        currX += velX * subDt;

        let diffY = currY - targetY;
        let accelY = -(omega * omega) * diffY - 2.0 * damping * omega * velY;
        velY += accelY * subDt;
        currY += velY * subDt;
      }

      if (Math.abs(currX - targetX) < 0.25 && Math.abs(velX) < 1.0) {
        currX = targetX;
        velX = 0;
      }
      if (Math.abs(currY - targetY) < 0.25 && Math.abs(velY) < 1.0) {
        currY = targetY;
        velY = 0;
      }

      dock._autohideVelocityX = velX;
      dock._autohideVelocityY = velY;
      dock.dash.translationX = currX;
      dock.dash.translationY = currY;

      // Spatial depth scale & optical dissolve
      let maxDist = vertical
        ? Math.max(Math.abs(targetX), 1.0)
        : Math.max(Math.abs(targetY), 1.0);
      let currDist = vertical ? Math.abs(currX) : Math.abs(currY);
      let p = Math.min(1.0, Math.max(0.0, currDist / maxDist));

      // Optical dissolve fade
      let dockOpacity = 255;
      if (p > 0.30) {
        let normP = (p - 0.30) / 0.70;
        let f = Math.cos(normP * Math.PI * 0.5);
        dockOpacity = Math.round(255 * f * f);
      }
      dock.dash.opacity = dockOpacity;

      // Pure 1:1 scale with no container distortion
      dock.dash.set_scale(1.0, 1.0);

      // Keep render loop actively ticking while animating autohide
      if (currX !== targetX || currY !== targetY || Math.abs(velX) > 0.5 || Math.abs(velY) > 0.5) {
        didScale = true;
      }
    }

    // background
    {
      dock._background.style = dock.extension._backgroundStyle;
      dock._background.update({
        first,
        last,
        iconSize: dock._iconSizeScaledDown,
        scaleFactor,
        position: dock._position,
        vertical: vertical,
        panel_mode: dock.extension.panel_mode,
        dock,
      });

      // allied areas
      //! this should be at the layout -- make independent of background
      // struts
      if (vertical) {
        dock.struts.width =
          dock._background.width +
          iconSize * 0.2 * scaleFactor +
          edge_distance -
          dock._background._padding * scaleFactor;
        dock.struts.height = dock.height;

        if (dock.extension.autohide_dash) {
          dock.struts.y = dock._background.y + dock._monitor.y;
          dock.struts.height = dock._background.height;
          if (!dock.extension.panel_mode && dock._background.height > 0) {
            dock.dwell.y = dock.struts.y;
            dock.dwell.height = dock.struts.height;
          }
          // X11 .. click through fix ..
          // dock.struts.width *= 1.25;
        }

        // dock.struts.y = dock.y;
        if (dock._position == DockPosition.RIGHT) {
          dock.struts.x = dock.x + dock.width - dock.struts.width;
        } else {
          dock.struts.x = dock.x;
        }
      } else {
        dock.struts.width = dock.width;
        dock.struts.height =
          dock._background.height +
          iconSize * 0.2 * scaleFactor +
          edge_distance -
          dock._background._padding * scaleFactor;

        if (dock.extension.autohide_dash) {
          dock.struts.x = dock._background.x + dock._monitor.x;
          dock.struts.width = dock._background.width;
          if (!dock.extension.panel_mode && dock._background.width > 0) {
            dock.dwell.x = dock.struts.x;
            dock.dwell.width = dock.struts.width;
          }
          // X11 .. click through fix ..
          // dock.struts.height *= 1.25;
        }

        // dock.struts.x = dock.x;
        if (dock._position == DockPosition.BOTTOM) {
          dock.struts.y = dock.y + dock.height - dock.struts.height;
        } else {
          dock.struts.y = dock.y;
        }
      }

      dock._updateTransparenies();
    }

    dock.struts.visible = !dock._hidden;

    //---------------------
    // animate the list
    //---------------------
    if (dock._list && dock._list.visible && dock._list._target) {
      dock._list.animate(dt);
      didScale = true;
    }

    if (this.isAnimating()) {
      didBounce = true;
      didScale = true;
    }

    if (didFadeIn || didScale || dock._dragging || didBounce) {
      dock.autohider._debounceCheckHide();
      dock._debounceEndAnimation();
    }

    dock.extension.integrations.bms_update_size(this);
  }

  bounceIcon(appwell) {
    let dock = this.dock;
    if (!dock || !this._rustEngine) return;

    let icons = dock._icons || dock._findIcons();
    if (!icons || icons.length === 0) return;

    let idx = icons.findIndex(ic => 
      ic === appwell || 
      ic.child === appwell || 
      ic._appwell === appwell || 
      (ic._appwell && appwell && ic._appwell.app && ic._appwell.app === appwell.app) ||
      (ic._appwell && appwell && ic._appwell._id && ic._appwell._id === appwell._id) ||
      (ic.child && appwell && ic.child._id && ic.child._id === appwell._id)
    );

    if (idx >= 0) {
      let heightSetting = dock.extension.animation_bounce_height ?? 0.75;
      let freqSetting = dock.extension.animation_bounce_frequency ?? 0;
      let bounces = [3, 1, 2, 3][freqSetting] || 3;
      let initialV = 360.0 + 200.0 * heightSetting;
      MacDockEngine.trigger_bounce(this._rustEngine, idx, initialV, bounces);
      dock._beginAnimation();
    }
  }
};
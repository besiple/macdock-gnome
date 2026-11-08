import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// these are hacks to make Dash2Dock Animated compatible with other Extensions
//
export const Integrations = class {
  enable() {
    this.hookCompiz();
    this.hookBms();
  }

  disable() {
    this.releaseCompiz();
    this.releaseBms();
  }

  hookCompiz(hook = true) {
    let compiz = Main.extensionManager.lookup(
      'compiz-alike-magic-lamp-effect@hermes83.github.com'
    );
    if (compiz && compiz.stateObj) {
      let stateObj = compiz.stateObj;
      this._compiz = stateObj;
      if (stateObj._getIcon && !hook) {
        stateObj.getIcon = stateObj._getIcon;
        stateObj._getIcon = null;
      }
      if (!stateObj._getIcon && hook) {
        stateObj._getIcon = stateObj.getIcon;
        if (this.extension.lamp_app_animation) {
          stateObj.getIcon = this.compiz_getIcon.bind(this);
        }
      }
    }
  }

  releaseCompiz() {
    this.hookCompiz(false);
    this._compiz = null;
  }

  // override compiz getIcon
  compiz_getIcon(actor) {
    let metaWin = actor.meta_window || (actor.get_meta_window ? actor.get_meta_window() : null);
    let monitor = Main.layoutManager.monitors[metaWin ? metaWin.get_monitor() : Main.layoutManager.primaryIndex] || Main.layoutManager.primaryMonitor;

    if (metaWin && metaWin.get_icon_geometry) {
      let [success, icon] = metaWin.get_icon_geometry();
      if (success && icon && (icon.x !== 0 || icon.y !== 0 || icon.width !== 0 || icon.height !== 0)) {
        return icon;
      }
    }

    let tracker = Shell.WindowTracker.get_default();
    let app = metaWin ? tracker.get_window_app(metaWin) : null;
    let appId = app ? app.get_id() : null;
    let wmClass = metaWin?.get_wm_class ? metaWin.get_wm_class() : null;
    let gtkId = metaWin?.get_gtk_application_id ? metaWin.get_gtk_application_id() : null;
    let pid = metaWin?.get_pid ? metaWin.get_pid() : null;
    let pids = app && app.get_pids ? app.get_pids() : [];
    if (pid && !pids.includes(pid)) pids.push(pid);

    let docks = this.extension.docks || [];
    let dock = docks.find((d) => d._monitorIndex === monitor.index) || docks[0];

    if (!dock) {
      return { x: monitor.x + monitor.width / 2, y: monitor.y + monitor.height, width: 0, height: 0, side: St.Side.BOTTOM };
    }

    let icons = dock._icons || (typeof dock._findIcons === 'function' ? dock._findIcons() : null) || [];
    for (let it of icons) {
      let itApp = it._appwell ? it._appwell.app : (it.app || null);
      let itAppId = itApp?.get_id ? itApp.get_id() : null;
      let match = false;

      if (app && itApp && app === itApp) {
        match = true;
      } else if (appId && itAppId && (itAppId === appId || itAppId.toLowerCase().includes(appId.toLowerCase()) || appId.toLowerCase().includes(itAppId.toLowerCase()))) {
        match = true;
      } else if (wmClass && itAppId && itAppId.toLowerCase().includes(wmClass.toLowerCase())) {
        match = true;
      } else if (gtkId && itAppId && itAppId.toLowerCase().includes(gtkId.toLowerCase())) {
        match = true;
      } else if (itApp && pids.length > 0 && itApp.get_pids && pids.some((p) => itApp.get_pids().includes(p))) {
        match = true;
      }

      if (match) {
        let pos = it.get_transformed_position();
        let size = it.get_transformed_size();
        let w = size[0] > 0 ? size[0] : 48;
        let h = size[1] > 0 ? size[1] : 48;
        let x = pos[0];
        let y = pos[1];

        if (it._screenCenterX !== undefined && it._slotCenterY !== undefined) {
          x = it._screenCenterX - w / 2;
          y = it._slotCenterY - h / 2;
        }

        let side = St.Side.BOTTOM;
        if (dock._position === 'top' || dock._position === 1) side = St.Side.TOP;
        else if (dock._position === 'left' || dock._position === 2) side = St.Side.LEFT;
        else if (dock._position === 'right' || dock._position === 3) side = St.Side.RIGHT;

        let cx = (it._screenCenterX !== undefined) ? it._screenCenterX : (x + w / 2);
        return { x: cx, y: monitor.y + monitor.height, width: 0, height: 0, side };
      }
    }

    let dockPos = dock.get_transformed_position ? dock.get_transformed_position() : [dock.x, dock.y];
    let dockSize = dock.get_transformed_size ? dock.get_transformed_size() : [dock.width, dock.height];
    let side = St.Side.BOTTOM;
    if (dock._position === 'top' || dock._position === 1) side = St.Side.TOP;
    else if (dock._position === 'left' || dock._position === 2) side = St.Side.LEFT;
    else if (dock._position === 'right' || dock._position === 3) side = St.Side.RIGHT;

    return {
      x: dockPos[0] + (dockSize[0] || 200) / 2,
      y: monitor.y + monitor.height,
      width: 0,
      height: 0,
      side
    };
  }

  hookBms(hook = true) {
    if (!hook) {
      this.extension.docks.forEach((dock) => {
        dock.animator._bms = null;
      });
    }

    let bms = Main.extensionManager.lookup('blur-my-shell@aunetx');
    this._bms = bms;
    if (bms && bms.stateObj && bms.metadata.version >= 70) {
      let obj = bms.stateObj;
      if (obj._dash_to_dock_blur) {
        if (!obj._dash_to_dock_blur.update_size_orig) {
          obj._dash_to_dock_blur.update_size_orig =
            obj._dash_to_dock_blur.update_size;
        }
        if (hook && this.extension.blur_background) {
          obj._dash_to_dock_blur.update_size = () => {};
        } else if (obj._dash_to_dock_blur.update_size_orig) {
          obj._dash_to_dock_blur.update_size =
            obj._dash_to_dock_blur.update_size_orig;
        }
      }
    }
  }

  releaseBms() {
    this.hookBms(false);
    this._bms = null;
  }

  bms_update_size(animator) {
    let dock = animator.dock;

    // blur my shell
    let bms = dock.get_children().find((child) => {
      let name = child.get_name();
      return name === 'bms-dash-backgroundgroup';
    });

    animator._bms = bms;

    if (!bms) {
      return;
    }

    bms.visible = dock.extension.blur_background;
    if (!bms.visible) {
      return;
    }

    // compatible blur-my-shell version 70
    // bms version 70 supports 46,47..up
    if (
      dock.extension.integrations._bms &&
      dock.extension.integrations._bms.metadata.version >= 70
    ) {
      let bg_offset_x = dock._background.x;
      let bg_offset_y = dock._background.y;
      let rw = dock.renderArea.width;
      let rh = dock.renderArea.height;

      let meta_background = bms.first_child.first_child;
      if (!meta_background) {
        // this should exists
        return;
      }

      // bottom layout
      switch (dock._position) {
        case 'left':
        case 'top':
          bms.x = 0;
          bms.y = 0;
          bms.first_child.x = 0;
          bms.first_child.y = 0;
          bms.first_child.set_clip(
            bg_offset_x,
            bg_offset_y,
            dock._background.width - (dock.extension.border_thickness && 0),
            dock._background.height - (dock.extension.border_thickness && 0)
          );
          break;
        case 'right':
          bms.x = 0;
          bms.y = 0;
          bms.first_child.x = -meta_background.width + rw;
          bms.first_child.y = 0;
          bms.first_child.set_clip(
            -bms.first_child.x + bg_offset_x,
            0 + bg_offset_y,
            dock._background.width - (dock.extension.border_thickness && 0),
            dock._background.height - (dock.extension.border_thickness && 0)
          );
          break;
        case 'bottom':
        default:
          bms.x = 0;
          bms.y = 0;
          bms.first_child.x = 0;
          bms.first_child.y = -meta_background.height + rh;
          bms.first_child.set_clip(
            0 + bg_offset_x,
            -bms.first_child.y + bg_offset_y,
            dock._background.width - (dock.extension.border_thickness && 0),
            dock._background.height - (dock.extension.border_thickness && 0)
          );
          break;
      }

      let opacity = (dock.extension.background_color[3] ?? 0.5) * 54 + 200;
      meta_background.opacity = opacity;

      animator._blur_effects = bms.first_child.get_effects();
      if (animator._blur_effects) {
        animator._blur_effects.forEach((e) => {
          if (e.constructor.name == 'CornerEffect') {
            e.radius = dock.extension.computed_border_radius;
          }
        });
      }

      return;
    }

    // bms version incompatible
    bms.visible = false;
  }
};

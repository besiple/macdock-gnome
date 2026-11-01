pub mod engine;
pub mod math;
pub mod physics;

use crate::engine::DockEngine;

pub struct MacDockEngineHandle {
    pub inner: DockEngine,
}

#[no_mangle]
pub extern "C" fn macdock_engine_create(count: u32) -> usize {
    let engine = DockEngine::new(count as usize);
    Box::into_raw(Box::new(MacDockEngineHandle { inner: engine })) as usize
}

#[no_mangle]
pub extern "C" fn macdock_engine_destroy(handle: usize) {
    if handle != 0 {
        unsafe {
            drop(Box::from_raw(handle as *mut MacDockEngineHandle));
        }
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_new(count: u32) -> usize {
    macdock_engine_create(count)
}

#[no_mangle]
pub extern "C" fn macdock_engine_free(handle: usize) {
    macdock_engine_destroy(handle);
}

#[no_mangle]
pub extern "C" fn macdock_engine_set_config(
    handle: usize,
    base_size: f64,
    max_scale: f64,
    radius: f64,
    spacing: f64,
) {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine.inner.set_config(base_size, max_scale, radius, spacing);
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_set_icon_count(handle: usize, count: u32) {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine.inner.set_icon_count(count as usize);
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_update_pointer(
    handle: usize,
    mouse_x: f64,
    inside: bool,
) {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine.inner.update_pointer(mouse_x, inside);
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_update_pointer_proximity(
    handle: usize,
    mouse_x: f64,
    proximity: f64,
) {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine.inner.update_pointer_proximity(mouse_x, proximity);
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_trigger_bounce(
    handle: usize,
    index: u32,
    initial_velocity: f64,
    max_bounces: u32,
) {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine
            .inner
            .trigger_bounce(index as usize, initial_velocity, max_bounces);
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_is_animating(handle: usize) -> bool {
    if handle != 0 {
        let engine = unsafe { &*(handle as *const MacDockEngineHandle) };
        engine.inner.is_animating()
    } else {
        false
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_step(handle: usize, dt: f64) {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine.inner.step(dt);
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_get_dock_width(handle: usize) -> f64 {
    if handle != 0 {
        let engine = unsafe { &*(handle as *const MacDockEngineHandle) };
        engine.inner.dock_width
    } else {
        0.0
    }
}

#[no_mangle]
pub extern "C" fn macdock_engine_get_icon_x(handle: usize, index: u32) -> f64 {
    if handle != 0 {
        let engine = unsafe { &*(handle as *const MacDockEngineHandle) };
        let i = index as usize;
        if i < engine.inner.transforms.len() {
            return engine.inner.transforms[i].x;
        }
    }
    0.0
}

#[no_mangle]
pub extern "C" fn macdock_engine_get_icon_y(handle: usize, index: u32) -> f64 {
    if handle != 0 {
        let engine = unsafe { &*(handle as *const MacDockEngineHandle) };
        let i = index as usize;
        if i < engine.inner.transforms.len() {
            return engine.inner.transforms[i].y;
        }
    }
    0.0
}

#[no_mangle]
pub extern "C" fn macdock_engine_get_icon_scale_x(
    handle: usize,
    index: u32,
) -> f64 {
    if handle != 0 {
        let engine = unsafe { &*(handle as *const MacDockEngineHandle) };
        let i = index as usize;
        if i < engine.inner.transforms.len() {
            return engine.inner.transforms[i].scale_x;
        }
    }
    1.0
}

#[no_mangle]
pub extern "C" fn macdock_engine_get_icon_scale_y(
    handle: usize,
    index: u32,
) -> f64 {
    if handle != 0 {
        let engine = unsafe { &*(handle as *const MacDockEngineHandle) };
        let i = index as usize;
        if i < engine.inner.transforms.len() {
            return engine.inner.transforms[i].scale_y;
        }
    }
    1.0
}

#[no_mangle]
pub extern "C" fn macdock_engine_feed_edge_motion(
    handle: usize,
    velocity: f64,
    dt: f64,
) -> bool {
    if handle != 0 {
        let engine = unsafe { &mut *(handle as *mut MacDockEngineHandle) };
        engine.inner.feed_edge_motion(velocity, dt)
    } else {
        false
    }
}

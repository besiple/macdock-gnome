use crate::math::{calculate_dock_layout, DockConfig, IconTransform};
use crate::physics::{EdgePressureAccumulator, IconBounceState, SpringFollower};

pub struct DockEngine {
    pub config: DockConfig,
    pub icon_count: usize,
    pub transforms: Vec<IconTransform>,
    pub bounces: Vec<IconBounceState>,
    pub lens_spring: SpringFollower,
    pub intensity_spring: SpringFollower,
    pub target_intensity: f64,
    pub target_pointer_x: f64,
    pub dock_width: f64,
    pub edge_pressure: EdgePressureAccumulator,
}

impl DockEngine {
    pub fn new(count: usize) -> Self {
        let config = DockConfig::default();
        let transforms = vec![
            IconTransform {
                x: 0.0,
                y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                is_magnified: false,
            };
            count
        ];
        let bounces = vec![IconBounceState::new(); count];

        let mut engine = Self {
            config,
            icon_count: count,
            transforms,
            bounces,
            lens_spring: SpringFollower::new(0.0, 18.0, 1.0), // Velvety lens glide
            intensity_spring: SpringFollower::new(0.0, 8.5, 1.0), // Smooth organic bloom
            target_intensity: 0.0,
            target_pointer_x: 0.0,
            dock_width: 0.0,
            edge_pressure: EdgePressureAccumulator::new(120.0),
        };

        engine.recalculate();
        engine
    }

    pub fn set_icon_count(&mut self, count: usize) {
        if self.icon_count == count {
            return;
        }
        self.icon_count = count;
        self.transforms.resize(
            count,
            IconTransform {
                x: 0.0,
                y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                is_magnified: false,
            },
        );
        self.bounces.resize(count, IconBounceState::new());
        self.recalculate();
    }

    pub fn set_config(&mut self, base_size: f64, max_scale: f64, radius: f64, spacing: f64) {
        self.config.base_icon_size = base_size;
        self.config.max_scale = max_scale;
        self.config.magnify_radius = radius;
        self.config.icon_spacing = spacing;
        self.recalculate();
    }

    pub fn update_pointer(&mut self, mouse_x_rel_dock_center: f64, inside: bool) {
        self.update_pointer_proximity(mouse_x_rel_dock_center, if inside { 1.0 } else { 0.0 });
    }

    pub fn update_pointer_proximity(&mut self, mouse_x_rel_dock_center: f64, proximity: f64) {
        let prox = proximity.clamp(0.0, 1.0);
        self.target_intensity = prox;
        if prox > 0.001 {
            self.target_pointer_x = mouse_x_rel_dock_center;
            // When mouse first touches dock from idle, smoothly initialize lens at mouse X
            if self.intensity_spring.current < 0.02 {
                self.lens_spring.current = mouse_x_rel_dock_center;
                self.lens_spring.velocity = 0.0;
            }
        }
    }

    pub fn trigger_bounce(&mut self, index: usize, initial_velocity: f64, max_bounces: u32) {
        if index < self.bounces.len() {
            self.bounces[index].trigger(initial_velocity, max_bounces);
        }
    }

    pub fn is_animating(&self) -> bool {
        // 1. Any active bounce?
        if self.bounces.iter().any(|b| b.is_active) {
            return true;
        }
        // 2. Intensity spring still moving?
        if (self.intensity_spring.current - self.target_intensity).abs() > 0.005
            || self.intensity_spring.velocity.abs() > 0.01
        {
            return true;
        }
        // 3. Lens spring still moving towards target while magnified?
        if self.intensity_spring.current > 0.02
            && (self.lens_spring.current - self.target_pointer_x).abs() > 0.5
        {
            return true;
        }
        false
    }

    pub fn step(&mut self, dt: f64) {
        // 1. Smooth bloom intensity transition (0.0 idle <--> proximity)
        self.intensity_spring.update(self.target_intensity, dt);

        // 2. Smooth lens position tracking
        if self.target_intensity > 0.001 || self.intensity_spring.current > 0.01 {
            self.lens_spring.update(self.target_pointer_x, dt);
        }

        // 3. Update all physical bouncing icons
        for bounce in &mut self.bounces {
            if bounce.is_active {
                bounce.update(dt);
            }
        }

        // 4. Recalculate layout and apply deformations
        self.recalculate();
    }

    pub fn recalculate(&mut self) {
        let intensity = self.intensity_spring.current;
        let lens = if intensity > 0.001 {
            Some(self.lens_spring.current)
        } else {
            None
        };

        self.dock_width = calculate_dock_layout(
            self.icon_count,
            lens,
            intensity,
            &self.config,
            &mut self.transforms,
        );

        // Superimpose bounce displacement and squish deformation
        for i in 0..self.icon_count.min(self.bounces.len()) {
            let bounce = &self.bounces[i];
            if bounce.is_active {
                self.transforms[i].y += bounce.y;
                self.transforms[i].scale_x *= bounce.squish_x;
                self.transforms[i].scale_y *= bounce.squish_y;
            }
        }
    }

    pub fn feed_edge_motion(&mut self, velocity: f64, dt: f64) -> bool {
        self.edge_pressure.feed_motion(velocity, dt)
    }
}

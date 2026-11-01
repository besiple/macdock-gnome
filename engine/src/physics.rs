/// Second-order critically damped spring filter for smooth mouse lens tracking
#[derive(Debug, Clone)]
pub struct SpringFollower {
    pub current: f64,
    pub velocity: f64,
    pub omega: f64,      // Natural frequency (rad/s)
    pub damping: f64,    // Damping ratio (1.0 = critically damped)
}

impl SpringFollower {
    pub fn new(initial: f64, omega: f64, damping: f64) -> Self {
        Self {
            current: initial,
            velocity: 0.0,
            omega,
            damping,
        }
    }

    pub fn update(&mut self, target: f64, dt: f64) {
        if dt <= 0.0 {
            return;
        }
        let steps = (dt / 0.004).ceil().max(1.0) as usize;
        let sub_dt = dt / (steps as f64);

        for _ in 0..steps {
            let diff = self.current - target;
            let accel = -self.omega * self.omega * diff - 2.0 * self.damping * self.omega * self.velocity;
            self.velocity += accel * sub_dt;
            self.current += self.velocity * sub_dt;
        }

        if (self.current - target).abs() < 0.005 && self.velocity.abs() < 0.05 {
            self.current = target;
            self.velocity = 0.0;
        }
    }
}

/// Physics-based rubber ball bounce with elastic ground impact & volume-conserving squish
#[derive(Debug, Clone)]
pub struct IconBounceState {
    pub y: f64,              // Displacement (pixels above baseline)
    pub velocity: f64,       // Pixels/sec
    pub gravity: f64,        // Gravity acceleration (px/s^2)
    pub restitution: f64,    // Elastic bounce energy retention
    pub squish_x: f64,       // Horizontal stretch/squash
    pub squish_y: f64,       // Vertical stretch/squash
    pub squish_vel_y: f64,   // Squash oscillator spring velocity
    pub is_active: bool,
    pub bounce_count: u32,
    pub max_bounces: u32,
    pub base_velocity: f64,
}

impl IconBounceState {
    pub fn new() -> Self {
        Self {
            y: 0.0,
            velocity: 0.0,
            gravity: 3200.0,
            restitution: 0.65,
            squish_x: 1.0,
            squish_y: 1.0,
            squish_vel_y: 0.0,
            is_active: false,
            bounce_count: 0,
            max_bounces: 3,
            base_velocity: 510.0,
        }
    }

    pub fn trigger(&mut self, initial_velocity: f64, max_bounces: u32) {
        let v0 = initial_velocity.max(200.0);
        self.y = 0.0;
        self.velocity = v0;
        self.base_velocity = v0;
        self.is_active = true;
        self.bounce_count = 0;
        self.max_bounces = max_bounces.max(1);
        self.squish_x = 1.0;
        self.squish_y = 1.0;
        self.squish_vel_y = 0.0;
    }

    pub fn update(&mut self, dt: f64) {
        if !self.is_active || dt <= 0.0 {
            return;
        }

        let substeps = 4;
        let sub_dt = dt / (substeps as f64);

        for _ in 0..substeps {
            self.velocity -= self.gravity * sub_dt;
            self.y += self.velocity * sub_dt;

            if self.y <= 0.0 {
                self.y = 0.0;
                self.bounce_count += 1;

                if self.bounce_count >= self.max_bounces || self.velocity.abs() < 70.0 {
                    self.velocity = 0.0;
                    self.is_active = false;
                    self.squish_y = 1.0;
                    self.squish_x = 1.0;
                    self.squish_vel_y = 0.0;
                    return;
                }

                let impact_intensity = (self.velocity.abs() / self.base_velocity)
                    .clamp(0.2, 1.0);
                self.velocity = self.velocity.abs() * self.restitution;

                // Tasteful Apple impact squash (compress by ~20% on hard hit)
                self.squish_y = 1.0 - 0.22 * impact_intensity;
                self.squish_vel_y = 6.0 * impact_intensity;
            } else {
                let norm_v = (self.velocity / self.base_velocity).clamp(-1.0, 1.0);
                let target_y = if norm_v.abs() < 0.15 {
                    0.97 // subtle soft apex
                } else if norm_v > 0.0 {
                    1.0 + 0.14 * norm_v.abs().powf(1.3) // tasteful upward stretch
                } else {
                    1.0 + 0.10 * norm_v.abs().powf(1.3) // tasteful downward stretch
                };

                let omega = 28.0;
                let damping = 0.65;
                let accel = -omega * omega * (self.squish_y - target_y)
                    - 2.0 * damping * omega * self.squish_vel_y;
                self.squish_vel_y += accel * sub_dt;
                self.squish_y += self.squish_vel_y * sub_dt;
            }

            self.squish_x = (1.0 / self.squish_y.max(0.4).sqrt()).clamp(0.80, 1.25);
        }
    }
}

/// Screen Edge Pressure Accumulator
#[derive(Debug, Clone)]
pub struct EdgePressureAccumulator {
    pub current_pressure: f64,
    pub threshold: f64,
    pub decay_rate: f64,
}

impl EdgePressureAccumulator {
    pub fn new(threshold: f64) -> Self {
        Self {
            current_pressure: 0.0,
            threshold,
            decay_rate: 3.5,
        }
    }

    pub fn feed_motion(&mut self, into_edge_velocity: f64, dt: f64) -> bool {
        if into_edge_velocity > 0.0 {
            self.current_pressure += into_edge_velocity * dt;
        }
        self.current_pressure *= (-self.decay_rate * dt).exp();
        if self.current_pressure >= self.threshold {
            self.current_pressure = 0.0;
            true
        } else {
            false
        }
    }

    pub fn reset(&mut self) {
        self.current_pressure = 0.0;
    }
}

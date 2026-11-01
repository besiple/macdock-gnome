use std::f64::consts::PI;

#[derive(Debug, Clone, Copy)]
pub struct IconTransform {
    pub x: f64,          // Center X relative to dock center
    pub y: f64,          // Center Y relative to dock baseline (positive is up)
    pub scale_x: f64,    // Scale factor
    pub scale_y: f64,    // Scale factor
    pub is_magnified: bool,
}

#[derive(Debug, Clone)]
pub struct DockConfig {
    pub base_icon_size: f64,
    pub max_scale: f64,
    pub magnify_radius: f64,
    pub icon_spacing: f64,
}

impl Default for DockConfig {
    fn default() -> Self {
        Self {
            base_icon_size: 52.0,
            max_scale: 1.65,
            magnify_radius: 155.0,
            icon_spacing: 8.0,
        }
    }
}

/// Calculates Apple's cosine-squared lens magnification and non-overlapping layout
pub fn calculate_dock_layout(
    count: usize,
    lens_x: Option<f64>,
    intensity: f64, // 0.0 (idle) to 1.0 (fully bloomed)
    config: &DockConfig,
    transforms: &mut [IconTransform],
) -> f64 {
    if count == 0 {
        return 0.0;
    }

    let w0 = config.base_icon_size;
    let s0 = config.icon_spacing;
    let max_m = (config.max_scale - 1.0) * intensity.clamp(0.0, 1.0);
    let radius = config.magnify_radius;

    let total_unmagnified = (count as f64) * w0 + ((count - 1) as f64) * s0;
    let start_unmagnified = -total_unmagnified * 0.5 + w0 * 0.5;

    let mut widths = vec![w0; count];
    let mut scales = vec![1.0; count];

    if max_m > 0.001 {
        if let Some(lx) = lens_x {
            for i in 0..count {
                let unmag_x = start_unmagnified + (i as f64) * (w0 + s0);
                let dist = (unmag_x - lx).abs();

                if dist < radius {
                    let norm = dist / radius;
                    let factor = (norm * PI * 0.5).cos();
                    let factor_sq = factor * factor; // Cosine squared bell curve
                    let scale = 1.0 + max_m * factor_sq;
                    scales[i] = scale;
                    widths[i] = w0 * scale;
                } else {
                    scales[i] = 1.0;
                    widths[i] = w0;
                }
            }
        }
    }

    // Cumulative positions so icons never overlap
    let total_magnified_width: f64 = widths.iter().sum::<f64>() + ((count - 1) as f64) * s0;
    let mut current_x = -total_magnified_width * 0.5 + widths[0] * 0.5;

    for i in 0..count {
        let scale = scales[i];
        let y_up = (widths[i] - w0) * 0.5; // Grow upward from baseline

        transforms[i] = IconTransform {
            x: current_x,
            y: y_up,
            scale_x: scale,
            scale_y: scale,
            is_magnified: scale > 1.001,
        };

        if i + 1 < count {
            let step = (widths[i] + widths[i + 1]) * 0.5 + s0;
            current_x += step;
        }
    }

    total_magnified_width
}

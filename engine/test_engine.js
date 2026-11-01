import MacDockEngine from 'gi://MacDockEngine?version=1.0';

console.log('--- 1. Creating MacDock Rust Engine ---');
const engine = MacDockEngine.create(7);
console.log('Engine created, handle:', engine);

MacDockEngine.set_config(engine, 52.0, 1.8, 140.0, 8.0);
console.log('Dock width (idle):', MacDockEngine.get_dock_width(engine));

for (let i = 0; i < 7; i++) {
    console.log(`Icon #${i}: x=${MacDockEngine.get_icon_x(engine, i).toFixed(1)}, y=${MacDockEngine.get_icon_y(engine, i).toFixed(1)}, scale=${MacDockEngine.get_icon_scale_x(engine, i).toFixed(2)}`);
}

console.log('\n--- 2. Moving Mouse over Icon #3 with proximity 1.0 ---');
const icon3_x = MacDockEngine.get_icon_x(engine, 3);
MacDockEngine.update_pointer_proximity(engine, icon3_x, 1.0);

console.log('Stepping 10 frames (160ms)...');
for (let f = 1; f <= 10; f++) {
    MacDockEngine.step(engine, 0.016);
    console.log(`Frame #${f}: is_animating=${MacDockEngine.is_animating(engine)}, Icon #3 scale=${MacDockEngine.get_icon_scale_x(engine, 3).toFixed(3)}, y=${MacDockEngine.get_icon_y(engine, 3).toFixed(1)}`);
}

console.log('\n--- 3. Triggering Bounce on Icon #2 ---');
MacDockEngine.trigger_bounce(engine, 2, 540.0, 3);
console.log('Stepping bounce for 30 frames (480ms)...');
for (let f = 1; f <= 30; f++) {
    MacDockEngine.step(engine, 0.016);
    if (f % 5 === 0) {
        console.log(`Frame #${f}: is_animating=${MacDockEngine.is_animating(engine)}, Icon #2 y=${MacDockEngine.get_icon_y(engine, 2).toFixed(1)}, scale_x=${MacDockEngine.get_icon_scale_x(engine, 2).toFixed(3)}, scale_y=${MacDockEngine.get_icon_scale_y(engine, 2).toFixed(3)}`);
    }
}

MacDockEngine.destroy(engine);
console.log('\n--- MacDock Rust Engine test COMPLETED SUCCESSFULLY! ---');

import MacDockEngine from 'gi://MacDockEngine?version=1.0';

const N = 8;
const w0 = 48.0;
const s0 = 8.0;
const maxScale = 1.8;
const radius = w0 * 2.8;

const engine = MacDockEngine.new(N);
MacDockEngine.set_config(engine, w0, maxScale, radius, s0);

// Unmagnified centers:
const origX = [];
const totalW = N * w0 + (N - 1) * s0;
for (let i = 0; i < N; i++) {
    origX.push(-totalW / 2 + w0 / 2 + i * (w0 + s0));
}

console.log('Unmagnified centers:', origX.map(x => x.toFixed(1)));

// Test hover over icon 4
const targetX = origX[4];
MacDockEngine.update_pointer(engine, targetX, true);
for (let f = 0; f < 15; f++) MacDockEngine.step(engine, 0.016);

console.log('\nMagnified results:');
for (let i = 0; i < N; i++) {
    const newX = MacDockEngine.get_icon_x(engine, i);
    const riseY = MacDockEngine.get_icon_y(engine, i);
    const scale = MacDockEngine.get_icon_scale_x(engine, i);
    const deltaX = newX - origX[i];
    console.log(`Icon #${i}: scale=${scale.toFixed(2)}, deltaX=${deltaX >= 0 ? '+' : ''}${deltaX.toFixed(1)}px, riseY=${riseY.toFixed(1)}px`);
}

MacDockEngine.free(engine);

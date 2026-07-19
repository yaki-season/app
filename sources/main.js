// ─────────────────────────────────────────────────────────────
// 익힘 셰이더 프로토타입
//
// 클릭하면 꼬치가 "굽기 전(날것)" ↔ "굽기 후(Perfect)" 로 전환된다.
// 슬라이더로 uDoneness / uTareAmount 전 구간을 직접 확인할 수 있다.
//
// 관련 스펙: aidd-input/00-basic-design/rendering-interaction.md §2.1
// 주의: 이 프로토타입의 수치는 전부 미확정이다 (aidd-input은 원본 계층).
// ─────────────────────────────────────────────────────────────

// 네기마 placeholder. 실제 아트가 나오면 이 경로만 바꾸면 된다.
const IMAGE_URL = '../art/skewer-negima.png';

const DONENESS_RAW = 0.0;
const DONENESS_PERFECT = 0.5;

// 목표값으로 따라가는 속도. 스펙 §4.3의 "즉시 부착 금지" 원칙과 같은 맥락.
const LERP_RATE = 3.2;

const canvas = document.getElementById('stage');
const gl = canvas.getContext('webgl2', { alpha: true, antialias: true });

const ui = {
    state: document.getElementById('state'),
    doneness: document.getElementById('doneness'),
    donenessVal: document.getElementById('donenessVal'),
    tare: document.getElementById('tare'),
    tareVal: document.getElementById('tareVal'),
    error: document.getElementById('error'),
};

function fail(msg) {
    ui.error.textContent = msg;
    ui.error.hidden = false;
    console.error(msg);
}

if (!gl) {
    fail('WebGL2를 사용할 수 없는 브라우저입니다.');
}

// ── 셰이더 ────────────────────────────────────────────────────

async function loadText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} 로드 실패 (${res.status})`);
    return res.text();
}

function compile(type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`${label} 컴파일 실패:\n${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
}

function link(vsSrc, fsSrc) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc, 'vertex shader'));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc, 'fragment shader'));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`program 링크 실패:\n${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
}

// ── 텍스처 ────────────────────────────────────────────────────

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
        img.src = url;
    });
}

function createTexture(img) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

// ── 상태 ──────────────────────────────────────────────────────

const state = {
    doneness: DONENESS_RAW,   // 현재 화면에 그려지는 값
    target: DONENESS_RAW,     // 따라갈 목표값
    tare: 0.0,
    cooked: false,            // 클릭 토글 상태
};

function label(d) {
    if (d < 0.12) return '날것';
    if (d < 0.42) return '굽는 중';
    if (d < 0.66) return 'Perfect';
    if (d < 0.85) return '살짝 탐';
    return '탄 상태';
}

function toggle() {
    state.cooked = !state.cooked;
    state.target = state.cooked ? DONENESS_PERFECT : DONENESS_RAW;
    ui.doneness.value = String(state.target);
}

// ── 메인 ──────────────────────────────────────────────────────

async function main() {
    const [vsSrc, fsSrc, img] = await Promise.all([
        loadText('./shaders/skewer.vert.glsl'),
        loadText('./shaders/skewer.frag.glsl'),
        loadImage(IMAGE_URL),
    ]);

    const prog = link(vsSrc, fsSrc);
    gl.useProgram(prog);

    const tex = createTexture(img);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    const u = {
        tex: gl.getUniformLocation(prog, 'uTex'),
        doneness: gl.getUniformLocation(prog, 'uDoneness'),
        tare: gl.getUniformLocation(prog, 'uTareAmount'),
        time: gl.getUniformLocation(prog, 'uTime'),
        texSize: gl.getUniformLocation(prog, 'uTexSize'),
    };
    gl.uniform1i(u.tex, 0);
    gl.uniform2f(u.texSize, img.width, img.height);

    // 정점 버퍼가 없어도 draw call은 VAO 바인딩을 요구한다
    gl.bindVertexArray(gl.createVertexArray());

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    function resize() {
        // pixelRatio 상한 1.5 — TECH-PERF-001 동작 규칙 2
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const size = canvas.clientWidth;
        const px = Math.round(size * dpr);
        if (canvas.width !== px || canvas.height !== px) {
            canvas.width = px;
            canvas.height = px;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // 입력
    canvas.addEventListener('pointerdown', toggle);
    ui.doneness.addEventListener('input', () => {
        state.target = parseFloat(ui.doneness.value);
        state.cooked = state.target > (DONENESS_RAW + DONENESS_PERFECT) / 2;
    });
    ui.tare.addEventListener('input', () => {
        state.tare = parseFloat(ui.tare.value);
    });

    let last = performance.now();

    function frame(now) {
        const dt = Math.min((now - last) / 1000, 0.05);   // 탭 복귀 시 점프 방지
        last = now;

        // 프레임레이트에 독립적인 지수 감쇠 보간
        const k = 1 - Math.exp(-LERP_RATE * dt);
        state.doneness += (state.target - state.doneness) * k;

        resize();
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(u.doneness, state.doneness);
        gl.uniform1f(u.tare, state.tare);
        gl.uniform1f(u.time, now / 1000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        ui.state.textContent = label(state.doneness);
        ui.donenessVal.textContent = state.doneness.toFixed(2);
        ui.tareVal.textContent = state.tare.toFixed(2);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

if (gl) {
    main().catch((err) => {
        const hint = location.protocol === 'file:'
            ? '\n\nfile:// 로 열면 셰이더와 이미지를 불러올 수 없습니다. README의 로컬 서버 실행 방법을 참고하세요.'
            : '';
        fail(err.message + hint);
    });
}

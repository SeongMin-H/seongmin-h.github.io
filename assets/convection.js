/*
	Schematic animation of the proposed mechanism in
	Hwang et al., Int. Commun. Heat Mass Transf. 181 (2026) 113109, Fig. 3.

	Domain I   both sides at the same temperature: no convection, GO uniformly dispersed
	Domain II  bottom heated: partial convection starts to carry the negatively charged GO
	Domain III convection fully developed: more GO near the cold (upper) interface than near
	           the hot (lower) one, and the short-circuit current saturates
	Cooling returns the fluid through II to I.
	Drawn for illustration only; values are not measured data.
*/
(function () {
	var root = document.querySelector('[data-convection]');
	if (!root) return;
	var canvas = root.querySelector('canvas');
	var ctx = canvas.getContext('2d');
	var phaseEls = root.querySelectorAll('[data-phase]');
	var dtEl = root.querySelector('[data-readout="dt"]');
	var iEl = root.querySelector('[data-readout="i"]');
	var toggle = root.querySelector('[data-toggle]');

	var COLD_TOP = [74, 128, 214];
	var COLD_MID = [80, 158, 226];
	var COLD_BOT = [79, 170, 230];
	var HOT_TOP = [58, 78, 160];
	var HOT_MID = [139, 64, 128];
	var HOT_BOT = [206, 62, 46];
	var CYAN = [143, 227, 245];
	var RED = [229, 72, 63];

	var CYCLE = 20;
	var CAPTURE = 0.8; // per second, at full convection
	var RELEASE = 0.3; // per second: some GO rejoins the circulation
	var ZONE = 0.22; // near-interface region, as a fraction of the reservoir height
	var W = 0, H = 0, dpr = 1;
	var t = 0, last = 0, playing = true, visible = true;

	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
	function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
	function rgb(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }

	// Timeline: heat (bottom temperature), conv (convection strength), reach (height of the convecting layer)
	function state(time) {
		var s = time % CYCLE;
		var heat = smooth((s - 2.5) / 2) * (1 - smooth((s - 14.5) / 3));
		var conv = smooth((s - 3.2) / 4.3) * 0.55 + smooth((s - 7) / 2.5) * 0.45;
		conv *= 1 - smooth((s - 14.8) / 3.4);
		var reach = 0.38 + 0.62 * smooth((s - 4) / 5);
		reach = Math.min(reach, 0.38 + 0.62 * (1 - smooth((s - 15) / 3)));
		var current = smooth((conv - 0.05) / 0.85);
		var phase = heat < 0.04 && conv < 0.04 ? 1 : conv > 0.85 ? 3 : 2;
		return { s: s, heat: heat, conv: conv, reach: reach, current: current, phase: phase };
	}

	// Reservoir geometry in canvas pixels
	var box = { x: 0, y: 0, w: 0, h: 0 };
	function layout() {
		var r = canvas.getBoundingClientRect();
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		W = Math.max(280, r.width);
		H = W * 0.74;
		canvas.style.height = H + 'px';
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		box.x = W * 0.1;
		box.w = W * 0.5;
		box.y = H * 0.17;
		box.h = H * 0.66;
	}

	// Particles live in normalized reservoir coordinates: X in [0,1] left to right, Y in [0,1] bottom to top
	function rand(a, b) { return a + Math.random() * (b - a); }
	var flakes = [], protons = [];
	// evenly spread heights so the start (domain I) is uniform
	var NF = 84;
	for (var i = 0; i < NF; i++) {
		var fx = rand(0.04, 0.96), fy = 0.05 + 0.9 * (i + rand(0.15, 0.85)) / NF;
		flakes.push({ x: fx, y: fy, x0: fx, y0: fy, held: false, hy: 0.9, a: rand(0, Math.PI), len: rand(0.8, 1.25), bend: rand(-0.5, 0.5), spin: rand(-0.6, 0.6) });
	}
	for (var j = 0; j < 30; j++) {
		var px = rand(0.04, 0.96), py = rand(0.05, 0.95);
		protons.push({ x: px, y: py, x0: px, y0: py });
	}

	// Two convection cells: hot fluid rises along the walls and sinks in the middle (Fig. 3)
	function velocity(X, Y, st) {
		if (Y > st.reach) return [0, 0];
		var A = -0.075 * st.conv;
		var ky = Math.PI / st.reach;
		var u = A * Math.sin(2 * Math.PI * X) * ky * Math.cos(ky * Y);
		var v = -A * 2 * Math.PI * Math.cos(2 * Math.PI * X) * Math.sin(ky * Y);
		return [u, v];
	}

	function step(p, st, dt, jitter, drift) {
		var vel = velocity(p.x, p.y, st);
		p.x += (vel[0] + (Math.random() - 0.5) * jitter) * dt;
		p.y += (vel[1] + (Math.random() - 0.5) * jitter + drift) * dt;
		// re-disperse while the fluid is quiet
		var calm = 1 - st.conv;
		if (st.s > 15 || st.s < 2.5) {
			p.x += (p.x0 - p.x) * 0.9 * calm * dt;
			p.y += (p.y0 - p.y) * 0.9 * calm * dt;
		}
		p.x = clamp(p.x, 0.03, 0.97);
		p.y = clamp(p.y, 0.04, 0.96);
	}

	function update(dt, st) {
		// Convection carries GO to the cold upper interface, where it builds up (Fig. 3a:
		// high density of charged GO near the cold side, low density near the hot side).
		var capture = st.conv > 0.15 ? CAPTURE * st.conv : 0;
		flakes.forEach(function (f) {
			if (f.held && (st.conv < 0.12 || Math.random() < RELEASE * dt)) f.held = false;
			if (!f.held && capture && f.y > 1 - ZONE && Math.random() < capture * dt) {
				f.held = true;
				f.hy = rand(0.8, 0.95);
			}
			if (f.held) {
				f.x = clamp(f.x + ((Math.random() - 0.5) * 0.08 + 0.03 * Math.sin(t * 0.7 + f.hy * 20)) * dt, 0.03, 0.97);
				f.y = clamp(f.y + ((f.hy - f.y) * 1.2 + (Math.random() - 0.5) * 0.04) * dt, 0.78, 0.96);
			} else {
				step(f, st, dt, 0.05, 0);
			}
			f.a += (f.spin * 0.3 + (f.held ? 0 : velocity(f.x, f.y, st)[0]) * 8) * dt;
		});
		protons.forEach(function (p) { step(p, st, dt, 0.09, 0.02 * st.conv); });
	}

	function toPx(X, Y) { return [box.x + X * box.w, box.y + (1 - Y) * box.h]; }

	function drawFluid(st) {
		var front = st.heat * (0.45 + 0.55 * st.reach);
		var g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
		g.addColorStop(0, rgb(mix(COLD_TOP, HOT_TOP, st.heat * 0.9)));
		g.addColorStop(clamp(1 - 0.75 * front, 0.2, 0.98), rgb(mix(COLD_MID, HOT_MID, st.heat)));
		g.addColorStop(1, rgb(mix(COLD_BOT, HOT_BOT, st.heat)));
		ctx.fillStyle = g;
		ctx.fillRect(box.x, box.y, box.w, box.h);
	}

	function arrowHead(x, y, ang, size, color) {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(ang);
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(size, 0);
		ctx.lineTo(-size * 0.7, size * 0.65);
		ctx.lineTo(-size * 0.7, -size * 0.65);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	// Loop arrows like the paper's schematic: red where fluid rises, blue where it sinks
	function drawLoops(st) {
		if (st.conv < 0.05) return;
		var a = clamp(st.conv * 1.2, 0, 0.85);
		var top = 1 - st.reach * 0.92;
		var yTop = box.y + box.h * (top + 0.04);
		var yBot = box.y + box.h * 0.95;
		var lw = Math.max(2, W * 0.007);
		[[0.1, 0.4], [0.9, 0.6]].forEach(function (pair) {
			var xo = box.x + box.w * pair[0];
			var xi = box.x + box.w * pair[1];
			var dir = xi > xo ? 1 : -1;
			ctx.lineWidth = lw;
			ctx.lineCap = 'round';
			ctx.strokeStyle = 'rgba(232,90,80,' + a + ')';
			ctx.beginPath();
			ctx.moveTo(xo, yBot);
			ctx.lineTo(xo, yTop);
			ctx.lineTo(xo + dir * box.w * 0.12, yTop);
			ctx.stroke();
			arrowHead(xo + dir * box.w * 0.12 + dir * lw, yTop, dir > 0 ? 0 : Math.PI, lw * 2.2, 'rgba(232,90,80,' + a + ')');
			ctx.strokeStyle = 'rgba(120,170,240,' + a + ')';
			ctx.beginPath();
			ctx.moveTo(xi, yTop);
			ctx.lineTo(xi, yBot);
			ctx.lineTo(xi - dir * box.w * 0.12, yBot);
			ctx.stroke();
			arrowHead(xi - dir * box.w * 0.12 - dir * lw, yBot, dir > 0 ? Math.PI : 0, lw * 2.2, 'rgba(120,170,240,' + a + ')');
		});
	}

	function drawFlake(f) {
		var p = toPx(f.x, f.y);
		var L = W * 0.022 * f.len;
		ctx.save();
		ctx.translate(p[0], p[1]);
		ctx.rotate(f.a);
		ctx.fillStyle = 'rgba(46,32,24,0.92)';
		ctx.beginPath();
		ctx.moveTo(-L / 2, 0);
		ctx.quadraticCurveTo(-L / 6, -L * 0.28 + f.bend * L * 0.2, L / 2, -L * 0.06);
		ctx.quadraticCurveTo(L / 6, L * 0.22 + f.bend * L * 0.2, -L / 2, 0);
		ctx.fill();
		ctx.restore();
	}

	function drawProton(p) {
		var q = toPx(p.x, p.y);
		ctx.fillStyle = 'rgba(255,236,170,0.95)';
		ctx.beginPath();
		ctx.arc(q[0], q[1], Math.max(1.6, W * 0.0045), 0, Math.PI * 2);
		ctx.fill();
	}

	function pill(text, x, y, bg, fg) {
		ctx.font = '600 ' + Math.round(W * 0.03) + 'px "IBM Plex Sans", system-ui, sans-serif';
		var tw = ctx.measureText(text).width;
		var ph = W * 0.05, pw = tw + W * 0.04;
		ctx.fillStyle = bg;
		ctx.beginPath();
		if (ctx.roundRect) ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2);
		else ctx.rect(x - pw / 2, y - ph / 2, pw, ph);
		ctx.fill();
		ctx.fillStyle = fg;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, x, y + 1);
	}

	function drawPlates(st) {
		var plateH = H * 0.03;
		var cx = box.x + box.w / 2;
		// nickel tape electrodes
		ctx.fillStyle = '#b9c0cc';
		ctx.fillRect(box.x - 4, box.y - plateH, box.w + 8, plateH);
		ctx.fillRect(box.x - 4, box.y + box.h, box.w + 8, plateH);
		// side walls (PDMS)
		ctx.fillStyle = 'rgba(255,255,255,0.18)';
		ctx.fillRect(box.x - 4, box.y, 4, box.h);
		ctx.fillRect(box.x + box.w, box.y, 4, box.h);
		pill('Cold side', cx, box.y - plateH - H * 0.055, rgb(CYAN), '#15305e');
		var hot = st.heat > 0.5;
		pill(hot ? 'Hot side' : 'Cold side', cx, box.y + box.h + plateH + H * 0.055,
			rgb(mix(CYAN, RED, st.heat)), st.heat > 0.45 ? '#ffffff' : '#15305e');
	}

	// External circuit with an ammeter; electrons flow from the top electrode to the bottom one
	function drawCircuit(st) {
		var plateH = H * 0.03;
		var xr = box.x + box.w + 4;
		var xw = W * 0.74;
		var yTop = box.y - plateH / 2;
		var yBot = box.y + box.h + plateH / 2;
		var cy = (yTop + yBot) / 2;
		var R = W * 0.085;
		ctx.strokeStyle = 'rgba(214,224,240,0.75)';
		ctx.lineWidth = Math.max(1.5, W * 0.004);
		ctx.beginPath();
		ctx.moveTo(xr, yTop);
		ctx.lineTo(xw, yTop);
		ctx.lineTo(xw, cy - R);
		ctx.moveTo(xw, cy + R);
		ctx.lineTo(xw, yBot);
		ctx.lineTo(xr, yBot);
		ctx.stroke();
		// meter
		ctx.fillStyle = '#0f1d38';
		ctx.strokeStyle = 'rgba(214,224,240,0.9)';
		ctx.beginPath();
		ctx.arc(xw, cy, R, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.strokeStyle = 'rgba(214,224,240,0.35)';
		ctx.beginPath();
		ctx.arc(xw, cy + R * 0.25, R * 0.72, Math.PI * 1.15, Math.PI * 1.85);
		ctx.stroke();
		var ang = Math.PI * 1.2 + st.current * Math.PI * 0.6;
		ctx.strokeStyle = '#ffd36b';
		ctx.lineWidth = Math.max(2, W * 0.005);
		ctx.beginPath();
		ctx.moveTo(xw, cy + R * 0.25);
		ctx.lineTo(xw + Math.cos(ang) * R * 0.78, cy + R * 0.25 + Math.sin(ang) * R * 0.78);
		ctx.stroke();
		ctx.fillStyle = '#e6ecf6';
		ctx.font = '600 ' + Math.round(W * 0.034) + 'px "IBM Plex Sans", system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('A', xw, cy + R * 0.55);
		// electrons along the wire
		if (st.current > 0.02) {
			var path = [[xr, yTop], [xw, yTop], [xw, yBot], [xr, yBot]];
			var lens = [], total = 0;
			for (var k = 0; k < 3; k++) {
				var d = Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]);
				lens.push(d); total += d;
			}
			var n = 9;
			for (var m = 0; m < n; m++) {
				var pos = ((m / n + t * 0.12 * st.current) % 1) * total;
				var seg = 0;
				while (seg < 2 && pos > lens[seg]) { pos -= lens[seg]; seg++; }
				var f = pos / lens[seg];
				var ex = path[seg][0] + (path[seg + 1][0] - path[seg][0]) * f;
				var ey = path[seg][1] + (path[seg + 1][1] - path[seg][1]) * f;
				if (Math.abs(ey - cy) < R + 2 && Math.abs(ex - xw) < 2) continue;
				ctx.fillStyle = 'rgba(255,211,107,' + (0.35 + 0.65 * st.current) + ')';
				ctx.beginPath();
				ctx.arc(ex, ey, Math.max(2, W * 0.006), 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}


	function countGO() {
		var top = 0, bot = 0;
		flakes.forEach(function (f) {
			if (f.y > 1 - ZONE) top++;
			else if (f.y < ZONE) bot++;
		});
		return [top, bot];
	}

	// Brackets beside the reservoir mark the regions next to the top and bottom interfaces
	function drawZones(st, n) {
		var a = 0.35 + 0.55 * smooth(st.conv / 0.6);
		var xb = box.x - W * 0.022;
		var zh = box.h * ZONE;
		ctx.strokeStyle = 'rgba(195,210,234,' + a * 0.8 + ')';
		ctx.lineWidth = 1.5;
		[[box.y, box.y + zh, n[0]], [box.y + box.h - zh, box.y + box.h, n[1]]].forEach(function (z) {
			ctx.beginPath();
			ctx.moveTo(xb + 5, z[0] + 2);
			ctx.lineTo(xb, z[0] + 2);
			ctx.lineTo(xb, z[1] - 2);
			ctx.lineTo(xb + 5, z[1] - 2);
			ctx.stroke();
			ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
			ctx.font = '600 ' + Math.round(W * 0.03) + 'px "IBM Plex Mono", ui-monospace, monospace';
			ctx.textAlign = 'right';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(z[2]), xb - 5, (z[0] + z[1]) / 2);
		});
		// faint dashed boundaries inside the fluid
		ctx.save();
		ctx.beginPath();
		ctx.rect(box.x, box.y, box.w, box.h);
		ctx.clip();
		ctx.setLineDash([4, 5]);
		ctx.strokeStyle = 'rgba(255,255,255,' + 0.28 * a + ')';
		ctx.lineWidth = 1;
		[box.y + zh, box.y + box.h - zh].forEach(function (y) {
			ctx.beginPath();
			ctx.moveTo(box.x, y);
			ctx.lineTo(box.x + box.w, y);
			ctx.stroke();
		});
		ctx.restore();
	}

	function drawLabels(st) {
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.font = '500 ' + Math.round(W * 0.026) + 'px "IBM Plex Mono", ui-monospace, monospace';
		ctx.fillStyle = 'rgba(195,210,234,0.9)';
		ctx.textAlign = 'center';
		ctx.fillText('e⁻', W * 0.74 + W * 0.05, box.y + box.h * 0.2);
	}

	function draw(st) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);
		drawFluid(st);
		ctx.save();
		ctx.beginPath();
		ctx.rect(box.x, box.y, box.w, box.h);
		ctx.clip();
		drawLoops(st);
		flakes.forEach(drawFlake);
		protons.forEach(drawProton);
		ctx.restore();
		drawPlates(st);
		var n = countGO();
		drawZones(st, n);
		drawCircuit(st);
		drawLabels(st);
		root.setAttribute('data-go', n[0] + '/' + n[1]);
	}

	function readouts(st) {
		phaseEls.forEach(function (el) {
			var on = Number(el.getAttribute('data-phase')) === st.phase;
			el.classList.toggle('on', on);
			el.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
		if (dtEl) dtEl.textContent = (st.heat * 10).toFixed(1) + ' °C';
		if (iEl) iEl.textContent = '+' + (st.current * 0.5).toFixed(2) + ' μA';
	}

	function frame(now) {
		var dt = Math.min(0.05, (now - last) / 1000 || 0);
		last = now;
		if (playing && visible && !document.hidden) {
			t += dt;
			var st = state(t);
			update(dt, st);
			draw(st);
			readouts(st);
		}
		requestAnimationFrame(frame);
	}

	function setPlaying(on) {
		playing = on;
		if (toggle) {
			toggle.setAttribute('aria-pressed', on ? 'false' : 'true');
			toggle.textContent = on ? 'Pause' : 'Play';
		}
	}

	// Jump to a domain: restart the cycle and replay it quickly up to that moment,
	// so the GO distribution matches the history of heating and convection.
	var SEEK = { 1: 1.0, 2: 6.5, 3: 12.5 };
	function seek(target) {
		flakes.forEach(function (f) { f.x = f.x0; f.y = f.y0; f.held = false; });
		protons.forEach(function (p) { p.x = p.x0; p.y = p.y0; });
		t = 0;
		var h = 1 / 30;
		while (t < target) {
			t += h;
			update(h, state(t));
		}
		var st = state(t);
		draw(st);
		readouts(st);
	}

	if (toggle) toggle.addEventListener('click', function () { setPlaying(!playing); });
	phaseEls.forEach(function (el) {
		el.addEventListener('click', function () { seek(SEEK[el.getAttribute('data-phase')]); });
	});
	if ('IntersectionObserver' in window) {
		new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);
	}
	window.addEventListener('resize', function () { layout(); draw(state(t)); });

	layout();
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce) {
		// show the fully developed state, still
		seek(SEEK[3]);
		setPlaying(false);
	} else {
		var st1 = state(0);
		draw(st1);
		readouts(st1);
	}
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(state(t)); });
	requestAnimationFrame(function (n) { last = n; requestAnimationFrame(frame); });
})();

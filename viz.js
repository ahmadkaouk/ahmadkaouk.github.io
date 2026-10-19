// Canvas simulations for the Selected work pieces, the work row's arrows and the nav's section highlight.
(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const styles = getComputedStyle(document.documentElement);
    const C = Object.fromEntries(["ink", "dim", "mid", "line", "leader", "accent", "card"].map((k) => [k, styles.getPropertyValue(`--${k}`).trim()]));
    const FONT = '11.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
    const BIG = '500 19.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
    const TAU = Math.PI * 2;

    const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());

    // Scatter n points in [x0,x1]×[y0,y1] (normalized), at least `gap` apart once x is scaled by `aspect`.
    function scatter(rand, n, [x0, x1, y0, y1], gap, aspect, first = []) {
        const pts = [...first];
        for (let tries = 0; pts.length < n && tries < 20000; tries++) {
            const p = { nx: x0 + rand() * (x1 - x0), ny: y0 + rand() * (y1 - y0) };
            if (pts.every((q) => Math.hypot((p.nx - q.nx) * aspect, p.ny - q.ny) > gap)) pts.push(p);
        }
        return pts;
    }

    function dot(ctx, x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
    }

    function line(ctx, x0, y0, x1, y1) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }

    function label(ctx, x, y, strong, rest = "") {
        ctx.font = FONT;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = C.ink;
        ctx.fillText(strong, x, y);
        ctx.fillStyle = C.dim;
        ctx.fillText(rest, x + ctx.measureText(strong).width, y);
    }

    // A lost frame, the same on every card: a short dashed stub ending in an ×.
    function lost(ctx, x, y0, y1) {
        ctx.save();
        ctx.strokeStyle = C.dim;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        line(ctx, x, y0, x, y1);
        ctx.setLineDash([]);
        ctx.strokeStyle = C.ink;
        line(ctx, x - 3, y1 - 3, x + 3, y1 + 3);
        line(ctx, x - 3, y1 + 3, x + 3, y1 - 3);
        ctx.restore();
    }

    // The figures across the top of a card: a small label over a large value, in one or two columns.
    function header(ctx, w, h, pairs) {
        const cols = [24, w / 2 + 8];
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        pairs.forEach(([name, value], i) => {
            ctx.font = FONT;
            ctx.fillStyle = C.dim;
            ctx.fillText(name, cols[i], Math.round(h * 0.13));
            ctx.font = BIG;
            ctx.fillStyle = C.ink;
            ctx.fillText(value, cols[i], Math.round(h * 0.21));
        });
    }

    // Sizes a canvas to its box at device resolution and animates it while on screen.
    function mount(canvas, sim) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        let w = 0, h = 0, visible = false, last = 0, raf = 0;
        const settle = () => { for (let i = 0; i < 600; i++) sim.update(1 / 60); };
        const draw = () => {
            if (!w) return;
            ctx.clearRect(0, 0, w, h);
            sim.draw(ctx);
        };
        const loop = (t) => {
            sim.update(Math.min((t - last) / 1000, 0.05));
            last = t;
            draw();
            raf = requestAnimationFrame(loop);
        };
        const play = () => {
            cancelAnimationFrame(raf);
            if (visible && !reduced) {
                last = performance.now();
                raf = requestAnimationFrame(loop);
            }
        };
        new ResizeObserver(() => {
            const r = canvas.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = r.width;
            h = r.height;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            sim.resize(w, h);
            if (reduced) settle();
            draw();
        }).observe(canvas);
        document.fonts?.ready.then(draw);
        new IntersectionObserver(([e]) => { visible = e.isIntersecting; play(); }).observe(canvas);
        const at = (e) => {
            const r = canvas.getBoundingClientRect();
            return [e.clientX - r.left, e.clientY - r.top];
        };
        let dragging = false;
        canvas.addEventListener("pointerdown", (e) => {
            dragging = true;
            canvas.setPointerCapture?.(e.pointerId);
            sim.press?.(...at(e));
            if (reduced) { settle(); draw(); }
        });
        canvas.addEventListener("pointermove", (e) => {
            if (!dragging || !sim.drag) return;
            sim.drag(...at(e));
            if (reduced) draw();
        });
        canvas.addEventListener("pointerup", () => { dragging = false; });
        canvas.addEventListener("pointercancel", () => { dragging = false; });
        if (sim.key) {
            canvas.tabIndex = 0;
            canvas.addEventListener("keydown", (e) => {
                if (!sim.key(e.key)) return;
                e.preventDefault();
                if (reduced) draw();
            });
        }
    }

    // Smart meters forwarding readings hop by hop to a collector (RPL-style tree).
    function mesh(caption) {
        const rand = rng(11);
        const pts = scatter(rand, 26, [0.05, 0.95, 0.08, 0.92], 0.12, 1.6, [{ nx: 0.5, ny: 0.5 }]);
        let w = 0, h = 0, nodes = [], packets = [], pulses = [], wait = 0.2;

        function build() {
            const range = h * 0.27;
            for (const n of nodes) { n.rank = Infinity; n.parent = null; }
            nodes[0].rank = 0;
            const queue = [nodes[0]];
            while (queue.length) {
                const a = queue.shift();
                for (const b of nodes) {
                    if (b.rank === Infinity && Math.hypot(a.x - b.x, a.y - b.y) < range) {
                        b.rank = a.rank + 1;
                        b.parent = a;
                        queue.push(b);
                    }
                }
            }
            if (caption) caption.textContent = `${nodes.length - 1} meters, 1 collector`;
        }
        const send = (n) => n.parent && packets.push({ from: n, to: n.parent, t: 0 });

        return {
            resize(W, H) {
                w = W;
                h = H;
                nodes = pts.map((p) => ({ x: p.nx * w, y: p.ny * h }));
                packets = [];
                build();
            },
            update(dt) {
                wait -= dt;
                if (wait <= 0) {
                    wait = 0.35 + rand() * 0.5;
                    send(nodes[1 + Math.floor(rand() * (nodes.length - 1))]);
                }
                for (const p of packets) {
                    p.t += (100 * dt) / (Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) || 1);
                    if (p.t < 1) continue;
                    if (p.to === nodes[0]) {
                        p.done = true;
                        pulses.push({ r: 6, a: 1 });
                    } else if (p.to.parent) {
                        p.from = p.to;
                        p.to = p.to.parent;
                        p.t = 0;
                    } else {
                        p.done = true;
                    }
                }
                packets = packets.filter((p) => !p.done);
                for (const s of pulses) { s.r += 32 * dt; s.a -= 1.2 * dt; }
                pulses = pulses.filter((s) => s.a > 0);
            },
            draw(ctx) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = C.line;
                ctx.beginPath();
                for (const n of nodes) if (n.parent) { ctx.moveTo(n.x, n.y); ctx.lineTo(n.parent.x, n.parent.y); }
                ctx.stroke();

                ctx.strokeStyle = C.accent;
                ctx.globalAlpha = 0.45;
                ctx.beginPath();
                for (const p of packets) { ctx.moveTo(p.from.x, p.from.y); ctx.lineTo(p.to.x, p.to.y); }
                ctx.stroke();

                for (const s of pulses) {
                    ctx.globalAlpha = s.a;
                    dot(ctx, nodes[0].x, nodes[0].y, s.r);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;

                ctx.fillStyle = C.dim;
                ctx.strokeStyle = C.dim;
                for (const n of nodes.slice(1)) {
                    dot(ctx, n.x, n.y, 2.6);
                    n.parent ? ctx.fill() : ctx.stroke();
                }
                ctx.fillStyle = C.ink;
                dot(ctx, nodes[0].x, nodes[0].y, 6);
                ctx.fill();

                ctx.fillStyle = C.accent;
                for (const p of packets) {
                    dot(ctx, p.from.x + (p.to.x - p.from.x) * p.t, p.from.y + (p.to.y - p.from.y) * p.t, 3);
                    ctx.fill();
                }
            },
            press(x, y) {
                if (nodes.length >= 80) return;
                pts.push({ nx: x / w, ny: y / h });
                nodes.push({ x, y });
                build();
                send(nodes[nodes.length - 1]);
            },
        };
    }


    // What does a program use, and what does it pay? Moonbeam's EVM bills each transaction for computation (gas),
    // proof size and, since MBIP-5, the new storage it adds, which every node keeps forever. The storage meter
    // (Frontier#1142, rust-ethereum/evm#173, Moonbeam#2452) is checked on every SSTORE and when CREATE stores code, but
    // only new slots (116 bytes each, once per transaction) and code (its length plus 112 bytes of metadata) add bytes.
    // Its limit is the gas paid ÷ 366, and the transaction pays the larger of its gas and its bytes × 366: it is billed
    // for its dominant resource. Top: a short program and what each instruction uses. Gas follows the EVM's Berlin rules:
    // 21,000 to begin, a new slot 20,000 + 2,100 for its first access, a slot already changed in this transaction 100,
    // an existing slot 2,900 + 2,100, a contract 32,000 + 200 per byte of code; the PUSH steps and the constructor's own
    // run (a few hundred gas) are left out. Bottom: both meters against the limits set by 220,000 gas paid.
    // Illustrative program only: the steps are invented; the costs and the counting rules are the real ones.
    function storageMeter() {
        const TYPE = '10.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
        const MONO = '10.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        const PAID = 220000, RATIO = 366, LIMIT = Math.floor(PAID / RATIO);
        // `op` is the instruction; the transaction's base cost is not one, so it is written in words.
        const STEPS = [
            { words: ["begin transaction", "begin"], why: ["base cost of any transaction", "base cost"], gas: 21000, bytes: 0 },
            { op: "SSTORE A, 1", why: ["write slot A: a new slot", "new slot"], gas: 22100, bytes: 116 },
            { op: "SSTORE A, 2", why: ["write A again: already counted", "A again"], gas: 100, bytes: 0 },
            { op: "SSTORE B, 9", why: ["write B: it existed, so not new", "B existed"], gas: 5000, bytes: 0 },
            { op: "SSTORE A, 3", why: ["write A again: already counted", "A again"], gas: 100, bytes: 0 },
            { op: "CREATE (300 B)", why: ["new contract: 300 B code + 112 B metadata", "code + metadata"], gas: 92000, bytes: 412 },
        ];
        const STEP = 0.9, START = 0.7, END = START + STEPS.length * STEP, LOOP = END + 5;
        const pad = 24;
        const fmt = (n) => n.toLocaleString("en-US");
        let w = 0, h = 0, t = 0;

        function text(ctx, s, x, y, color, align = "left", weight = "") {
            ctx.font = `${weight} ${TYPE}`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.fillText(s, x, y);
        }
        const width = (ctx, s, weight = "") => {
            ctx.font = `${weight} ${TYPE}`;
            return ctx.measureText(s).width;
        };
        // The longest of the wordings that fits in `room`.
        const fit = (ctx, options, room, weight = "") => options.find((s) => width(ctx, s, weight) <= room) || options[options.length - 1];

        return {
            resize(W, H) { w = W; h = H; },
            update(dt) { t = reduced ? LOOP - 0.01 : (t + dt) % LOOP; },
            press() { t = 0; },
            draw(ctx) {
                ctx.textBaseline = "alphabetic";
                ctx.lineWidth = 1;
                const Y = (f) => Math.round(h * f);
                const done = Math.max(0, Math.min(STEPS.length, Math.floor((t - START) / STEP) + 1));
                const finished = done === STEPS.length, narrow = w < 480;

                text(ctx, fit(ctx, ["A virtual machine bills each program for what it uses. What does this one use?", "What does this program use, and pay?", "What does it use?"], w - 2 * pad, "500"), pad, Y(0.085), C.ink, "left", "500");
                text(ctx, fit(ctx, ["Metered as it runs, identically on every node: gas for each instruction, bytes for each new slot or contract", "Metered as it runs: gas per instruction, bytes per new slot", "Metered as it runs"], w - 2 * pad), pad, Y(0.15), C.dim);

                // The program, listed like a debugger, with what each instruction uses of each resource.
                const colW = Math.max(width(ctx, narrow ? "Compute" : "Compute (gas)"), width(ctx, "92,000", "500")) + 14;
                const cBytes = w - pad, cGas = cBytes - colW - (narrow ? 4 : 14);
                const opX = pad + 16, whyX = narrow ? 0 : pad + 16 + Math.min(116, (w - 2 * pad) * 0.22);
                const hy = Y(0.225);
                text(ctx, "Instruction", opX, hy, C.dim);
                text(ctx, fit(ctx, ["Compute (gas)", "Compute"], colW + 6), cGas, hy, C.dim, "right");
                text(ctx, fit(ctx, ["Storage (bytes)", "Storage"], colW + 6), cBytes, hy, C.dim, "right");
                ctx.strokeStyle = C.line;
                line(ctx, pad, hy + 7.5, w - pad, hy + 7.5);
                STEPS.forEach((s, i) => {
                    const y = Y(0.285 + i * 0.05);
                    const ran = i < done, next = i === done && t >= START - 0.4;
                    if (next || (i === done - 1 && t - START - i * STEP < 0.45)) text(ctx, "▸", pad, y, C.ink);
                    if (s.op) {
                        ctx.font = MONO;
                        ctx.fillStyle = ran || next ? C.ink : C.mid;
                        ctx.textAlign = "left";
                        ctx.fillText(s.op, opX, y);
                    } else text(ctx, fit(ctx, s.words, (whyX || cGas - colW) - opX - 10), opX, y, ran || next ? C.dim : C.mid);
                    if (!ran) return;
                    if (whyX) text(ctx, fit(ctx, s.why, cGas - colW - whyX - 6), whyX, y, C.dim);
                    text(ctx, fmt(s.gas), cGas, y, C.ink, "right");
                    text(ctx, s.bytes ? `+${s.bytes}` : "+0", cBytes, y, s.bytes ? C.accent : C.dim, "right", s.bytes ? "500" : "");
                });

                // Two meters, one budget: each fills toward its own limit, both set by the gas the transaction paid.
                const by = Y(0.62);
                text(ctx, fit(ctx, ["Two meters, one budget: the 220,000 gas this transaction paid for", "Two meters, one budget: 220,000 gas paid", "One budget: 220,000 gas"], w - 2 * pad), pad, by, C.dim);
                line(ctx, pad, by + 10.5, w - pad, by + 10.5);
                const sum = (k) => STEPS.slice(0, done).reduce((a, s) => a + s[k], 0);
                const gas = sum("gas"), bytes = sum("bytes");
                const meters = [
                    { titles: [`Compute: ${fmt(gas)} of ${fmt(PAID)} gas`, `Compute: ${fmt(gas)} gas`, "Compute"], share: gas / PAID, mine: false },
                    { titles: [`Storage: ${bytes} of ${LIMIT} bytes (220,000 ÷ 366)`, `Storage: ${bytes} of ${LIMIT} bytes`, "Storage"], share: bytes / LIMIT, mine: true },
                ];
                const dominant = meters[1].share > meters[0].share ? 1 : 0;
                meters.forEach((m, k) => {
                    const y = Y(0.7 + k * 0.105), ry = y + Y(0.04);
                    const pct = `${Math.round(m.share * 100)}% of its limit`;
                    const lit = finished && k === dominant;
                    text(ctx, pct, w - pad, y, lit ? C.accent : C.ink, "right", lit ? "500" : "");
                    text(ctx, fit(ctx, m.titles, w - 2 * pad - width(ctx, pct, "500") - 12, m.mine ? "500" : ""), pad, y, m.mine ? C.ink : C.dim, "left", m.mine ? "500" : "");
                    ctx.fillStyle = C.leader;
                    ctx.fillRect(pad, ry - 3, w - 2 * pad, 6);
                    ctx.fillStyle = m.mine ? C.accent : C.ink;
                    ctx.fillRect(pad, ry - 3, (w - 2 * pad) * Math.min(1, m.share), 6);
                });
                if (finished) {
                    text(ctx, fit(ctx, [`Pays for its dominant resource, storage: ${bytes} B × 366 = ${fmt(bytes * RATIO)} gas, not ${fmt(gas)}`, `Pays for storage, its dominant resource: ${fmt(bytes * RATIO)} gas`, `Pays for its dominant resource: ${fmt(bytes * RATIO)} gas`, `Pays ${fmt(bytes * RATIO)} gas, for storage`], w - 2 * pad, "500"), pad, Y(0.945), C.accent, "left", "500");
                } else {
                    text(ctx, fit(ctx, ["Pays for the resource it uses the largest share of", "Pays for its dominant resource"], w - 2 * pad), pad, Y(0.945), C.dim);
                }
            },
        };
    }


    // Which neighbor should a meter send through? Top: its links to A and B, each carrying packets at 600 kbps
    // (dark) and 200 kbps (grey); a lost try is marked and sent again. Bottom: each neighbor's score, judged at one
    // speed only (tries per packet at 600 kbps, picks B) and as in US 11,133,887: each speed's tries per packet
    // weighted by its share of the tries, drawn as one segment per speed with the working beside it (picks A).
    // Blue marks only the patent's pick. Illustrative model only: the figures are fixed (A needs 2.5 tries per packet at 600 kbps
    // and 1.0 at 200 kbps, with 20% and 80% of its tries; B needs 2.0 and 1.8, split evenly) and the packets match.
    function linkQuality() {
        const rand = rng(11);
        // A size below the other cards' labels: this figure carries more text.
        const TYPE = '10.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
        const SPEEDS = ["600 kbps", "200 kbps"];
        const TRAVEL = 2, CAP = 4, MAX = 2.5;
        // p: delivery odds at each speed; fast: share of sends at 600 kbps; etx and share: the fixed figures.
        const links = [
            { name: "A", p: [0.4, 1], fast: 0.09, etx: [2.5, 1.0], share: [0.2, 0.8] },
            { name: "B", p: [0.5, 0.556], fast: 0.47, etx: [2.0, 1.8], share: [0.5, 0.5] },
        ].map((l) => ({ ...l, wait: rand() * 0.5, sent: 0, real: l.etx[0] * l.share[0] + l.etx[1] * l.share[1] }));
        const tint = (k) => (k === 0 ? C.ink : C.mid);
        const pct = (v) => `${Math.round(v * 100)}%`;
        const pad = 24, BOX = 46, NODE = 22;
        let w = 0, h = 0, packets = [];

        const laneY = (n, k) => Math.round(h * (0.165 + n * 0.135 + k * 0.055));
        const lane = () => [pad + BOX + 64, w - pad - NODE - 8];
        // The longest of the wordings that fits in `room`.
        const fit = (ctx, options, room) => options.find((s) => ctx.measureText(s).width <= room) || options[options.length - 1];

        function text(ctx, s, x, y, color, align = "left", weight = "") {
            ctx.font = `${weight} ${TYPE}`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.fillText(s, x, y);
        }

        // One group of bars: a title, its pick on the right, then a bar per neighbor built from speed segments.
        function bars(ctx, y, titles, strong, parts, total, working) {
            const pick = total(links[0]) <= total(links[1]) ? 0 : 1;
            const lit = strong ? C.accent : C.ink;
            ctx.font = `500 ${TYPE}`;
            const verdict = `picks ${links[pick].name}`;
            text(ctx, verdict, w - pad, y, lit, "right", "500");
            const room = w - 2 * pad - ctx.measureText(verdict).width - 12;
            ctx.font = `${strong ? "500" : ""} ${TYPE}`;
            text(ctx, fit(ctx, titles, room), pad, y, strong ? C.ink : C.dim, "left", strong ? "500" : "");
            const bx = pad + 18, bw = (w - pad - 30 - bx) / MAX;
            links.forEach((l, n) => {
                const ry = Math.round(y + h * (0.065 + n * 0.06));
                text(ctx, l.name, pad, ry + 4, n === pick ? lit : C.dim, "left", n === pick ? "500" : "");
                let x = bx;
                parts(l).forEach(([value, k]) => {
                    ctx.fillStyle = tint(k);
                    ctx.fillRect(x, ry - 4, value * bw, 8);
                    x += value * bw;
                });
                const result = total(l).toFixed(1);
                text(ctx, result, w - pad, ry + 4, n === pick ? lit : C.dim, "right", n === pick ? "500" : "");
                // The working, e.g. "20% × 2.5 + 80% × 1.0 =", when it fits after the bar.
                if (working) {
                    ctx.font = `500 ${TYPE}`;
                    const rx = w - pad - ctx.measureText(result).width - 4;
                    ctx.font = TYPE;
                    const sum = `${working(l)} =`;
                    if (rx - ctx.measureText(sum).width > x + 10) text(ctx, sum, rx, ry + 4, C.dim, "right");
                }
            });
        }

        return {
            resize(W, H) { w = W; h = H; },
            update(dt) {
                for (const l of links) {
                    l.wait -= dt;
                    if (l.wait <= 0) {
                        l.wait = 0.4 + rand() * 0.25;
                        // A's few 600 kbps sends come every 11th packet (about 9%), so one is usually in view.
                        const fast = l.name === "A" ? l.sent % 11 === 0 : rand() < l.fast;
                        l.sent++;
                        packets.push({ l, k: fast ? 0 : 1, n: 1, u: 0, state: 0, a: 1, dy: 0 });
                    }
                }
                const retries = [];
                for (const p of packets) {
                    if (p.state !== 2) p.u += dt / TRAVEL;
                    if (p.state === 0 && p.u >= 0.5) {
                        const ok = rand() < p.l.p[p.k];
                        p.state = ok ? 1 : 2;
                        if (!ok && p.n < CAP) retries.push({ l: p.l, k: p.k, n: p.n + 1, u: 0, state: 0, a: 1, dy: 0 });
                    }
                    if (p.state === 2) p.a -= 0.8 * dt;
                }
                packets = packets.filter((p) => p.a > 0 && p.u < 1).concat(retries);
            },
            draw(ctx) {
                ctx.textBaseline = "alphabetic";
                ctx.lineWidth = 1;
                ctx.font = `500 ${TYPE}`;
                const ask = fit(ctx, ["Which neighbor should the meter send through?", "Which neighbor should it send through?"], w - 2 * pad);
                text(ctx, ask, pad, Math.round(h * 0.085), C.ink, "left", "500");

                // The meter on the left, a lane per speed to each neighbor, and the packets on them.
                const [x0, x1] = lane();
                const top = laneY(0, 0) - 9, bottom = laneY(1, 1) + 9;
                ctx.strokeStyle = C.ink;
                ctx.strokeRect(pad + 0.5, top + 0.5, BOX, bottom - top);
                text(ctx, "Meter", pad + BOX / 2, Math.round((top + bottom) / 2) + 4, C.ink, "center");
                links.forEach((l, n) => {
                    const a = laneY(n, 0) - 9, b = laneY(n, 1) + 9;
                    ctx.strokeStyle = C.ink;
                    ctx.strokeRect(w - pad - NODE + 0.5, a + 0.5, NODE, b - a);
                    text(ctx, l.name, w - pad - NODE / 2, Math.round((a + b) / 2) + 4, C.ink, "center", "500");
                    SPEEDS.forEach((speed, k) => {
                        const y = laneY(n, k);
                        text(ctx, speed, pad + BOX + 10, y + 4, tint(k));
                        ctx.setLineDash([1, 4]);
                        ctx.strokeStyle = C.line;
                        line(ctx, x0, y, x1, y);
                        ctx.setLineDash([]);
                    });
                });
                for (const p of packets) {
                    const px = x0 + p.u * (x1 - x0), py = laneY(links.indexOf(p.l), p.k);
                    ctx.globalAlpha = p.a;
                    if (p.state === 2) lost(ctx, px, py, py + 8);
                    else { ctx.fillStyle = tint(p.k); ctx.fillRect(px - 3, py - 3, 6, 6); }
                }
                ctx.globalAlpha = 1;

                // Tries per packet: at 600 kbps only, then weighted by where each link's tries really go.
                // Heading, with a key for the two speeds on the right: the patent's bars are built from both.
                const hy = Math.round(h * 0.49);
                ctx.font = TYPE;
                const key = SPEEDS.map((speed) => 10 + ctx.measureText(speed).width).reduce((a, b) => a + b + 12, -12);
                let kx = w - pad - key;
                SPEEDS.forEach((speed, k) => {
                    ctx.fillStyle = tint(k);
                    ctx.fillRect(kx, hy - 7, 6, 6);
                    text(ctx, speed, kx + 10, hy, C.dim);
                    kx += 10 + ctx.measureText(speed).width + 12;
                });
                text(ctx, fit(ctx, ["Score per neighbor, shorter is better", "Score, shorter is better", "Score"], w - 2 * pad - key - 16), pad, hy, C.dim);
                ctx.strokeStyle = C.line;
                line(ctx, pad, hy + 10.5, w - pad, hy + 10.5);
                bars(ctx, Math.round(h * 0.575), ["Usual: tries per packet at one speed (600 kbps)", "Usual: tries at one speed (600 kbps)", "Usual: one speed"], false,
                    (l) => [[l.etx[0], 0]], (l) => l.etx[0]);
                bars(ctx, Math.round(h * 0.785), ["Patent: each speed's tries, weighted by its share of the tries", "Patent: weighted by where the tries go", "Patent: all speeds"], true,
                    (l) => [[l.etx[0] * l.share[0], 0], [l.etx[1] * l.share[1], 1]], (l) => l.real,
                    (l) => `${pct(l.share[0])} × ${l.etx[0].toFixed(1)} + ${pct(l.share[1])} × ${l.etx[1].toFixed(1)}`);
            },
        };
    }


    // Which speed should a meter send at? Top: its link to a neighbor, with a 600 kbps lane and a 25 kbps lane (a
    // 25 kbps packet is drawn longer: it spends 24 times as long on air), and the estimated signal margin at 600 kbps.
    // Bottom: the speed in use over time, for the usual rule (keep the preferred speed) and for US 10,833,910 (test a
    // faster speed now and then). As in the patent: no tests while the estimated margin is below what 600 kbps needs,
    // a test on 1% of packets per dB of margin, kept between 1% and 30%, and a faster speed kept while its packets get
    // through until it becomes the preferred one. The margin is only an estimate, so real packets confirm it.
    // Illustrative model only: the margin over time, the delivery odds, the packet rate and "four straight successes
    // make 600 kbps preferred" are invented. The story replays the same way each loop: draws happen only when a
    // packet is sent, from a reseeded generator.
    function fasterSpeeds(seed = 82) {
        const TYPE = '10.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
        const LOOP = 16, EVERY = 0.32, TRAVEL = 1.4, BETTER = [1.5, 5.5], STREAK = 4, LOW = -10, HIGH = 16;
        const SPEEDS = ["600 kbps", "25 kbps"], LEVELS = ["600", "25"];
        const tint = (k) => (k === 0 ? C.ink : C.mid);
        const pad = 24, BOX = 46;
        // Estimated margin at 600 kbps in dB: below what it needs at first, then the link gets better.
        const margin = (at) => (at < BETTER[0] ? -8 : at < BETTER[1] ? -8 + (22 * (at - BETTER[0])) / (BETTER[1] - BETTER[0]) : 14);
        const testRate = (m) => Math.min(0.3, Math.max(0.01, m * 0.01));
        const odds = (fast, m) => (!fast ? 0.98 : m < 0 ? 0.1 : Math.min(0.99, 0.55 + 0.04 * m));
        let w = 0, h = 0, t = 0, rand, next, preferred, streak, last, packets, history;

        function reset() {
            rand = rng(seed);
            next = 0;
            preferred = 1;
            streak = 0;
            last = { k: 1, ok: true };
            packets = [];
            history = [];
        }

        // One packet: on the preferred speed, on 600 kbps again if the last test got through, or a test with the
        // margin-based chance once the estimated margin reaches what 600 kbps needs.
        function send(at) {
            const m = margin(at);
            let k = 1;
            if (preferred === 0 || (last.k === 0 && last.ok)) k = 0;
            else if (m >= 0 && rand() < testRate(m)) k = 0;
            const ok = rand() < odds(k === 0, m);
            if (k === 0) {
                streak = ok ? streak + 1 : 0;
                if (streak >= STREAK) preferred = 0;
            }
            last = { k, ok };
            history.push({ at, k, ok });
            packets.push({ k, ok, u: (t - at) / TRAVEL, a: 1 });
        }

        function text(ctx, s, x, y, color, align = "left", weight = "") {
            ctx.font = `${weight} ${TYPE}`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.fillText(s, x, y);
        }
        const fit = (ctx, options, room) => options.find((s) => ctx.measureText(s).width <= room) || options[options.length - 1];

        // One method's speed over time: a title, then a line between a 600 kbps level and a 25 kbps level,
        // labelled at the left with both levels and at the right with the speed it is on now.
        function strip(ctx, y, titles, strong, steps) {
            ctx.font = `${strong ? "500" : ""} ${TYPE}`;
            text(ctx, fit(ctx, titles, w - 2 * pad), pad, y, strong ? C.ink : C.dim, "left", strong ? "500" : "");
            const hi = Math.round(y + h * 0.035), lo = Math.round(y + h * 0.095), color = strong ? C.accent : C.ink;
            const x0 = pad + 28, x1 = w - pad - 58, X = (at) => x0 + (Math.min(at, LOOP) / LOOP) * (x1 - x0);
            // The signal improving, shaded as far as the story has got.
            if (t > BETTER[0]) {
                ctx.fillStyle = C.leader;
                ctx.fillRect(X(BETTER[0]), hi - 4, X(Math.min(t, BETTER[1])) - X(BETTER[0]), lo - hi + 8);
            }
            ctx.font = TYPE;
            text(ctx, LEVELS[0], x0 - 6, hi + 4, C.dim, "right");
            text(ctx, LEVELS[1], x0 - 6, lo + 4, C.dim, "right");
            ctx.strokeStyle = C.leader;
            ctx.lineWidth = 1;
            line(ctx, x0, hi + 0.5, x1, hi + 0.5);
            line(ctx, x0, lo + 0.5, x1, lo + 0.5);
            let now = 1, level = lo;
            steps.forEach((s, i) => {
                const end = i + 1 < steps.length ? steps[i + 1].at : t;
                // A lost test leaves the line where it was, with the shared lost mark reaching up to 600.
                if (s.k === 0 && !s.ok) lost(ctx, X(s.at), level, hi + 3);
                const y1 = s.k === 0 && s.ok ? hi : s.k === 0 ? level : lo;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(X(s.at), level);
                ctx.lineTo(X(s.at), y1);
                ctx.lineTo(X(end), y1);
                ctx.stroke();
                ctx.lineWidth = 1;
                level = y1;
                now = y1 === hi ? 0 : 1;
            });
            text(ctx, SPEEDS[now], w - pad, (now === 0 ? hi : lo) + 4, color, "right", "500");
            return [X, lo];
        }

        reset();
        return {
            resize(W, H) { w = W; h = H; },
            update(dt) {
                t += dt;
                if (t >= LOOP) { t -= LOOP; reset(); }
                while (next <= t) { send(next); next += EVERY; }
                for (const p of packets) {
                    if (p.ok || p.u < 0.5) p.u += dt / TRAVEL;
                    else p.a -= 0.9 * dt;
                }
                packets = packets.filter((p) => p.a > 0 && p.u < 1);
            },
            draw(ctx) {
                ctx.textBaseline = "alphabetic";
                ctx.lineWidth = 1;
                ctx.font = `500 ${TYPE}`;
                text(ctx, fit(ctx, ["Which speed should the meter send at?", "Which speed should it send at?"], w - 2 * pad), pad, Math.round(h * 0.08), C.ink, "left", "500");

                // The link: a lane per speed, labelled above, with the preferred one marked.
                ctx.font = `500 ${TYPE}`;
                const node = Math.ceil(ctx.measureText("Neighbor").width) + 14;
                const lx0 = pad + BOX + 10, lx1 = w - pad - node - 10;
                const laneY = (k) => Math.round(h * (k === 0 ? 0.185 : 0.27));
                const top = laneY(0) - 20, bottom = laneY(1) + 10;
                ctx.strokeStyle = C.ink;
                ctx.strokeRect(pad + 0.5, top + 0.5, BOX, bottom - top);
                ctx.strokeRect(w - pad - node + 0.5, top + 0.5, node, bottom - top);
                text(ctx, "Meter", pad + BOX / 2, Math.round((top + bottom) / 2) + 4, C.ink, "center");
                text(ctx, "Neighbor", w - pad - node / 2, Math.round((top + bottom) / 2) + 4, C.ink, "center");
                SPEEDS.forEach((speed, k) => {
                    const y = laneY(k);
                    text(ctx, speed, lx0, y - 7, C.ink, "left", k === preferred ? "500" : "");
                    if (k === preferred) {
                        ctx.font = `500 ${TYPE}`;
                        text(ctx, "preferred", lx0 + ctx.measureText(speed).width + 6, y - 7, C.dim);
                    }
                    ctx.setLineDash([1, 4]);
                    ctx.strokeStyle = C.line;
                    line(ctx, lx0, y, lx1, y);
                    ctx.setLineDash([]);
                });
                // Packets: a 25 kbps one is drawn longer, since it spends 24 times as long on air.
                for (const p of packets) {
                    const len = p.k === 0 ? 4 : 18, px = lx0 + p.u * (lx1 - lx0), py = laneY(p.k);
                    ctx.globalAlpha = p.a;
                    if (!p.ok && p.u >= 0.5) lost(ctx, px, py, py + 8);
                    else { ctx.fillStyle = tint(p.k); ctx.fillRect(px - len / 2, py - 3, len, 6); }
                }
                ctx.globalAlpha = 1;
                ctx.font = TYPE;
                text(ctx, fit(ctx, ["The same reading spends 24× as long on air at 25 kbps", "24× as long on air at 25 kbps"], lx1 - lx0), lx0, Math.round(h * 0.27) + 20, C.dim);

                // Estimated margin at 600 kbps, against what it needs, and what the patent's rule does with it.
                const m = margin(t), gy = Math.round(h * 0.395);
                ctx.font = TYPE;
                const gl = fit(ctx, ["Estimated margin at 600 kbps", "Margin at 600 kbps"], (w - 2 * pad) / 2);
                text(ctx, gl, pad, gy, C.dim);
                const bx0 = pad + ctx.measureText(gl).width + 10, bx1 = w - pad - 40, B = (v) => bx0 + ((bx1 - bx0) * (v - LOW)) / (HIGH - LOW);
                ctx.fillStyle = C.leader;
                ctx.fillRect(bx0, gy - 7, bx1 - bx0, 6);
                ctx.fillStyle = m >= 0 ? C.ink : C.mid;
                ctx.fillRect(bx0, gy - 7, B(m) - bx0, 6);
                ctx.fillStyle = C.ink;
                ctx.fillRect(B(0) - 0.5, gy - 11, 1, 14);
                text(ctx, `${m > 0 ? "+" : ""}${Math.round(m)} dB`, w - pad, gy, C.ink, "right");
                const status = preferred === 0 ? ["600 kbps is now the preferred speed"]
                    : last.k === 0 && last.ok ? ["The last test got through: staying on 600 kbps", "Last test got through: staying"]
                    : m < 0 ? ["Below what 600 kbps needs: no tests", "Too weak: no tests"]
                    : [`Tests 600 kbps on ${Math.round(testRate(m) * 100)}% of packets; the margin is only an estimate`, `Tests 600 kbps on ${Math.round(testRate(m) * 100)}% of packets`];
                text(ctx, fit(ctx, status, w - 2 * pad), pad, gy + 17, C.ink);

                // Speed in use over time, for each method.
                const hy = Math.round(h * 0.5);
                text(ctx, "Speed in use over time", pad, hy, C.dim);
                ctx.strokeStyle = C.line;
                line(ctx, pad, hy + 9.5, w - pad, hy + 9.5);
                const sy = [Math.round(h * 0.565), Math.round(h * 0.745)];
                const [X] = strip(ctx, sy[0], ["Usual: keep the preferred speed", "Usual: keep preferred"], false, [{ at: 0, k: 1, ok: true }]);
                const [, lo] = strip(ctx, sy[1], ["Patent: test a faster speed now and then", "Patent: test faster now and then", "Patent: test faster"], true, history);
                // Name the first lost test and the first test that was kept, under the patent's line.
                const miss = history.find((e) => e.k === 0 && !e.ok);
                const kept = history.find((e, i) => e.k === 0 && e.ok && history[i + 1] && history[i + 1].k === 0);
                ctx.font = TYPE;
                let free = -Infinity;
                [[miss, "test lost", C.dim], [kept, "kept", C.accent]].forEach(([e, label, color]) => {
                    if (!e) return;
                    // Centred under its step, nudged right when it would run into the label before it.
                    const tw = ctx.measureText(label).width, x = Math.max(X(e.at) - tw / 2, free + 6);
                    text(ctx, label, x, lo + 15, color);
                    free = x + tw;
                });
                if (t > BETTER[0]) text(ctx, "signal improves", X(BETTER[0]), Math.round(h * 0.955), C.dim);
            },
        };
    }

    // Who should get an offer first? The same crowd twice, each phone shaded by its interest in the offer's topic
    // (0 to 3). Left, the usual rule from earlier work: the best-connected phones. Right, the rule from the WCNC 2017
    // paper: the interested phones whose neighbors are most interested (its equation 3). Each seed gets the offer over
    // cellular and passes it once to the phones in range, as in the paper's first scenarios. Below, the paper's own
    // results (its Figure 3; its text swaps the two scenarios, the figure and the master's thesis agree on these).
    // Illustrative crowd only: positions and interests are invented; both rules are run on it as written.
    function diffusion() {
        const TYPE = '10.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
        // [x, y, interest] in a unit box; phones closer than RANGE (with x scaled by ASPECT) are in radio range.
        const CROWD = [[0.326, 0.5, 0], [0.389, 0.42, 1], [0.274, 0.4, 0], [0.411, 0.58, 1], [0.305, 0.62, 2], [0.358, 0.7, 0],
            [0.242, 0.55, 2], [0.453, 0.48, 0], [0.789, 0.3, 3], [0.663, 0.3, 2], [0.916, 0.3, 2], [0.789, 0.06, 3],
            [0.789, 0.72, 2], [0.663, 0.72, 3], [0.916, 0.72, 1], [0.789, 0.95, 3], [0.158, 0.16, 2], [0.284, 0.16, 3],
            [0.032, 0.16, 3], [0.589, 0.51, 1], [0.211, 0.84, 1], [0.537, 0.12, 0], [0.979, 0.52, 0]];
        const RANGE = 0.32, ASPECT = 1.9, K = 3, LOOP = 9, SEED = 0.9, SEND = 1.9, HOP = 0.7, HOLD = 8.2;
        // The paper's Figure 3: share of users' interest reached, best-connected seeds against interest-aware seeds.
        const RESULTS = [[["Dense crowd"], 57, 66], [["City streets (Helsinki map)", "City streets"], 41, 52]];
        const nb = CROWD.map((a, i) => CROWD.map((b, j) => (i !== j && Math.hypot((a[0] - b[0]) * ASPECT, a[1] - b[1]) < RANGE ? j : -1)).filter((j) => j >= 0));
        const top = (score) => score.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, K).map((p) => p[1]);
        const interested = CROWD.filter((c) => c[2] > 0).length;
        // When each phone gets the offer: seeds over cellular, then one hop from each seed, a little apart.
        function plan(seeds) {
            const at = CROWD.map(() => Infinity);
            seeds.forEach((s, k) => {
                at[s] = Math.min(at[s], SEED + k * 0.15);
                for (const j of nb[s]) at[j] = Math.min(at[j], SEND + k * 0.15 + HOP);
            });
            return { seeds, at };
        }
        const rules = [
            { titles: ["Usual: the best-connected phones", "Usual: best-connected", "Usual"], strong: false,
                ...plan(top(nb.map((n) => n.length))) },
            { titles: ["Paper: phones whose neighbors care", "Paper: neighbors care", "Paper"], strong: true,
                ...plan(top(nb.map((n, i) => (CROWD[i][2] > 0 ? n.reduce((s, j) => s + CROWD[j][2], 0) : -1)))) },
        ];
        const shade = [null, C.line, C.dim, C.ink];
        const pad = 24;
        let w = 0, h = 0, t = 0;

        function text(ctx, s, x, y, color, align = "left", weight = "") {
            ctx.font = `${weight} ${TYPE}`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.fillText(s, x, y);
        }
        const fit = (ctx, options, room) => options.find((s) => ctx.measureText(s).width <= room) || options[options.length - 1];

        // A phone: hollow if not interested, darker the more interested; blue once it has the offer.
        function phone(ctx, x, y, r, interest, got) {
            dot(ctx, x, y, r);
            if (interest === 0) {
                ctx.fillStyle = C.card;
                ctx.fill();
                ctx.strokeStyle = got ? C.accent : C.line;
                ctx.lineWidth = got ? 1.5 : 1;
                ctx.stroke();
            } else {
                ctx.fillStyle = got ? C.accent : shade[interest];
                ctx.fill();
            }
            ctx.lineWidth = 1;
        }

        // One crowd with one rule's seeds, the offer travelling one hop, and how many interested phones it reached.
        function panel(ctx, rule, x0, x1, y0, y1, fade) {
            ctx.font = `${rule.strong ? "500" : ""} ${TYPE}`;
            text(ctx, fit(ctx, rule.titles, x1 - x0), x0, y0 - 9, rule.strong ? C.ink : C.dim, "left", rule.strong ? "500" : "");
            const r = Math.max(2.5, Math.min(3.5, (x1 - x0) / 80));
            const P = (i) => [x0 + r + 4 + CROWD[i][0] * (x1 - x0 - 2 * r - 8), y0 + r + 4 + CROWD[i][1] * (y1 - y0 - 2 * r - 8)];
            ctx.strokeStyle = C.leader;
            nb.forEach((n, i) => n.forEach((j) => { if (j > i) line(ctx, ...P(i), ...P(j)); }));
            CROWD.forEach((c, i) => phone(ctx, ...P(i), r, c[2], fade > 0 && rule.at[i] <= t));
            ctx.globalAlpha = fade;
            rule.seeds.forEach((s, k) => {
                const grow = Math.min(1, Math.max(0, (t - SEED - k * 0.15) / 0.3));
                if (grow <= 0) return;
                ctx.strokeStyle = C.ink;
                dot(ctx, ...P(s), r + 3.5 * grow);
                ctx.stroke();
                const go = (t - SEND - k * 0.15) / HOP;
                if (go <= 0 || go >= 1) return;
                ctx.fillStyle = C.accent;
                for (const j of nb[s]) {
                    const [ax, ay] = P(s), [bx, by] = P(j);
                    dot(ctx, ax + (bx - ax) * go, ay + (by - ay) * go, 2);
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;
            const got = CROWD.filter((c, i) => c[2] > 0 && rule.at[i] <= t && fade > 0).length;
            ctx.font = `${rule.strong ? "500" : ""} ${TYPE}`;
            const count = fit(ctx, [`reached ${got} of ${interested} interested`, `${got} of ${interested} interested`, `${got}/${interested}`], x1 - x0);
            text(ctx, count, x0, y1 + 16, rule.strong ? C.ink : C.dim, "left", rule.strong ? "500" : "");
        }

        // Key for the shading: not interested, more interested, seed, got the offer.
        function legend(ctx, y) {
            ctx.font = TYPE;
            const long = ["not interested", "more interested", "seed", "got the offer", "got it, doesn't care"];
            const short = ["none", "more", "seed", "got it", "wasted"];
            const width = (labels) => labels.reduce((s, l, i) => s + (i === 1 ? 30 : i === 2 ? 14 : 12) + ctx.measureText(l).width + 14, -14);
            const labels = width(long) <= w - 2 * pad ? long : short;
            let x = pad;
            labels.forEach((l, i) => {
                if (i === 0) { phone(ctx, x + 4, y - 4, 3.5, 0, false); x += 12; }
                if (i === 1) { [1, 2, 3].forEach((lv, k) => phone(ctx, x + 4 + k * 9, y - 4, 3.5, lv, false)); x += 30; }
                if (i === 2) { ctx.strokeStyle = C.ink; dot(ctx, x + 4, y - 4, 6); ctx.stroke(); phone(ctx, x + 4, y - 4, 2.5, 2, false); x += 14; }
                if (i === 3) { phone(ctx, x + 4, y - 4, 3.5, 2, true); x += 12; }
                if (i === 4) { phone(ctx, x + 4, y - 4, 3.5, 0, true); x += 12; }
                text(ctx, l, x, y, C.dim);
                x += ctx.measureText(l).width + 14;
            });
        }

        return {
            resize(W, H) { w = W; h = H; },
            update(dt) { t = reduced ? 6 : (t + dt) % LOOP; },
            press() { t = 0; },
            draw(ctx) {
                ctx.textBaseline = "alphabetic";
                ctx.lineWidth = 1;
                ctx.font = `500 ${TYPE}`;
                text(ctx, fit(ctx, ["Who should get the restaurant offer first?", "Who should get the offer first?"], w - 2 * pad), pad, Math.round(h * 0.075), C.ink, "left", "500");
                legend(ctx, Math.round(h * 0.14));

                // The same crowd under each rule, side by side.
                const fade = t > HOLD ? Math.max(0, 1 - (t - HOLD) / (LOOP - HOLD - 0.1)) : 1;
                const gap = 16, pw = (w - 2 * pad - gap) / 2;
                const y0 = Math.round(h * 0.24), y1 = Math.round(h * 0.53);
                rules.forEach((rule, k) => panel(ctx, rule, pad + k * (pw + gap), pad + k * (pw + gap) + pw, y0, y1, fade));

                // The paper's results: share of users' interest reached, per scenario.
                const hy = Math.round(h * 0.635);
                ctx.font = `500 ${TYPE}`;
                text(ctx, fit(ctx, ["Real results, from the paper's simulations (the toy crowd above exaggerates the gap)", "Real results, from the paper's simulations", "Real results (paper)"], w - 2 * pad), pad, hy, C.ink, "left", "500");
                ctx.font = TYPE;
                text(ctx, fit(ctx, ["Share of users' interest reached: each person counts by how much they care", "Share of interest reached, weighted by how much each person cares", "Share of interest reached"], w - 2 * pad), pad, hy + 15, C.dim);
                ctx.strokeStyle = C.line;
                line(ctx, pad, hy + 24.5, w - pad, hy + 24.5);
                const bx0 = pad + 44, bx1 = w - pad - 34;
                RESULTS.forEach(([names, usual, paper], g) => {
                    const gy = Math.round(h * (0.74 + g * 0.125));
                    ctx.font = TYPE;
                    text(ctx, fit(ctx, names, w - 2 * pad), pad, gy, C.dim);
                    [["Usual", usual, C.ink], ["Paper", paper, C.accent]].forEach(([name, value, color], k) => {
                        const ry = Math.round(gy + h * (0.036 + k * 0.034));
                        text(ctx, name, pad, ry + 4, k ? C.ink : C.dim, "left", k ? "500" : "");
                        ctx.fillStyle = C.leader;
                        ctx.fillRect(bx0, ry - 3, bx1 - bx0, 6);
                        ctx.fillStyle = color;
                        ctx.fillRect(bx0, ry - 3, ((bx1 - bx0) * value) / 100, 6);
                        text(ctx, `${value}%`, w - pad, ry + 4, k ? C.ink : C.dim, "right", k ? "500" : "");
                    });
                });
            },
        };
    }

    // How does a meter on a 20-year battery still pass its readings along? Rows are the hops of the route RPL picked,
    // time runs left to right over 12 s. Battery radios sleep and listen in short scheduled windows (ticks); a reading
    // waits for the next hop's window, goes out on that window's channel, and if lost is retried at the following one.
    // The collector runs on mains power and always listens. Below, the trade-off for three wake intervals: radio-on
    // time is window / interval, delay is the average wait for each sleeping hop (half an interval each).
    // Illustrative model only: the 10 ms window, the intervals, the channels and the losses are invented, and the
    // relays are assumed to be battery meters on their own schedules.
    function battery() {
        const TYPE = '10.5px "Golos Text", ui-sans-serif, system-ui, sans-serif';
        const WINDOW = 0.01, SPAN = 12, SPEED = 1.5, LOSS = 0.25, HOLD = 2.5;
        const OPTIONS = [0.25, 1, 4];
        const ROWS = [["Meter", 0.05], ["Relay 1", 0.35], ["Relay 2", 0.7], ["Collector", null]];
        const SLEEPERS = ROWS.slice(1).filter((r) => r[1] !== null).length;
        const pad = 24;
        let w = 0, h = 0, pick = 1, loops = 0, trip;
        const secs = (v) => (v < 10 ? `${+v.toFixed(2)} s` : `${Math.round(v)} s`);
        const pct = (v) => `${+(v * 100).toFixed(2)}%`;

        // One reading's trip at interval T: wait for each hop's next window, retry a lost frame at the one after.
        function plan() {
            const T = OPTIONS[pick], rand = rng(10 + loops * 7 + pick);
            const ready = 0.6 + rand() * 0.8, hops = [];
            let t = ready;
            for (let k = 1; k < ROWS.length; k++) {
                const phase = ROWS[k][1];
                for (let tries = 0; ; tries++) {
                    const at = phase === null ? t + 0.05 : Math.ceil((t - phase * T) / T) * T + phase * T;
                    const ok = phase === null || tries === 2 || rand() >= LOSS;
                    hops.push({ from: k - 1, at, ok, ch: 1 + Math.floor(rand() * 64) });
                    t = at + (ok ? 0.03 : T * 0.02);
                    if (ok) break;
                }
            }
            trip = { T, ready, hops, done: hops[hops.length - 1].at, t: 0 };
        }

        function text(ctx, s, x, y, color, align = "left", weight = "") {
            ctx.font = `${weight} ${TYPE}`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.fillText(s, x, y);
        }
        const fit = (ctx, options, room) => options.find((s) => ctx.measureText(s).width <= room) || options[options.length - 1];

        plan();
        return {
            resize(W, H) { w = W; h = H; },
            update(dt) {
                trip.t += reduced ? 0 : dt * SPEED;
                if (reduced) trip.t = trip.done + 0.1;
                // After the reading lands and a short pause, show the next interval.
                if (!reduced && trip.t > Math.min(SPAN, trip.done + HOLD)) { loops++; pick = (pick + 1) % OPTIONS.length; plan(); }
            },
            press(x, y) {
                const k = Math.round((y / h - 0.73) / 0.08);
                if (y / h > 0.68 && k >= 0 && k < OPTIONS.length) { pick = k; loops++; plan(); }
            },
            key(k) {
                if (k !== "ArrowUp" && k !== "ArrowDown") return false;
                pick = (pick + (k === "ArrowDown" ? 1 : OPTIONS.length - 1)) % OPTIONS.length;
                loops++;
                plan();
                return true;
            },
            draw(ctx) {
                const { T, ready, hops, done, t } = trip;
                ctx.textBaseline = "alphabetic";
                ctx.lineWidth = 1;
                ctx.font = `500 ${TYPE}`;
                text(ctx, fit(ctx, ["How does a meter on a 20-year battery still pass its readings along?", "How does a 20-year meter pass readings along?", "Passing readings on a 20-year battery"], w - 2 * pad), pad, Math.round(h * 0.075), C.ink, "left", "500");

                // Key, two lines: what each mark means, then how a reading moves and what "ch" is.
                const ky = Math.round(h * 0.135), wide = w > 480;
                ctx.font = TYPE;
                // The longest set of key labels that fits on one line.
                const marks = [7, 19, 22, 12], span = (ls) => ls.reduce((sum, l, i) => sum + marks[i] + ctx.measureText(l).width + 14, -14);
                const keys = [["listening", "asleep", "a reading", "lost, retried at the next window"], ["listening", "asleep", "reading", "lost, retried"],
                    ["listening", "asleep", "reading", "lost"]].find((ls) => span(ls) <= w - 2 * pad) || ["listen", "sleep", "reading", "lost"];
                let kx = pad;
                keys.forEach((k, i) => {
                    if (i === 0) { ctx.fillStyle = C.dim; ctx.fillRect(kx, ky - 10, 1.5, 10); kx += 7; }
                    if (i === 1) { ctx.strokeStyle = C.line; line(ctx, kx, ky - 1.5, kx + 14, ky - 1.5); kx += 19; }
                    if (i === 2) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.5; line(ctx, kx, ky - 4, kx + 12, ky - 4); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.fillStyle = C.accent; dot(ctx, kx + 14, ky - 4, 3); ctx.fill(); kx += 22; }
                    if (i === 3) { lost(ctx, kx + 3, ky - 12, ky - 3); kx += 12; }
                    text(ctx, k, kx, ky, C.dim);
                    kx += ctx.measureText(k).width + 14;
                });
                text(ctx, fit(ctx, ["A reading waits until the next hop listens, then goes out on that window's channel (ch)",
                    "A reading waits for the next hop to listen; ch is the radio channel", "Waits for the next hop to listen"], w - 2 * pad), pad, ky + 16, C.dim);

                // Time-space view: one row per hop, 0 to 12 s.
                const lx = pad, x0 = pad + (w > 480 ? 70 : 58), x1 = w - pad, X = (s) => x0 + (Math.min(s, SPAN) / SPAN) * (x1 - x0);
                const rowY = (k) => Math.round(h * (0.25 + k * 0.075));
                ROWS.forEach(([name, phase], k) => {
                    const y = rowY(k);
                    text(ctx, name, lx, y + 4, C.dim);
                    if (phase === null) {
                        ctx.fillStyle = C.ink;
                        ctx.fillRect(x0, y - 1, x1 - x0, 2);
                        ctx.font = TYPE;
                        text(ctx, fit(ctx, ["mains power, always listening", "always listening"], (x1 - x0) / 2), x1, y - 6, C.dim, "right");
                        return;
                    }
                    ctx.strokeStyle = C.line;
                    line(ctx, x0, y + 0.5, x1, y + 0.5);
                    ctx.fillStyle = C.dim;
                    for (let s = phase * T; s <= SPAN; s += T) ctx.fillRect(X(s) - 0.75, y - 9, 1.5, 9);
                });
                ctx.fillStyle = C.mid;
                for (let s = 1; s < SPAN; s++) ctx.fillRect(X(s) - 0.5, rowY(3) + 2, 1, 4);
                text(ctx, "0 s", x0, rowY(3) + 17, C.dim);
                text(ctx, `${SPAN} s`, x1, rowY(3) + 17, C.dim, "right");

                // The reading: waits on its row, then jumps to the next hop on that window's channel.
                let row = 0, since = ready;
                ctx.strokeStyle = C.accent;
                ctx.fillStyle = C.accent;
                for (const hop of hops) {
                    if (hop.at > t) break;
                    if (since < t) { ctx.globalAlpha = 0.5; ctx.lineWidth = 2; line(ctx, X(since), rowY(row), X(hop.at), rowY(row)); ctx.lineWidth = 1; ctx.globalAlpha = 1; }
                    const xa = X(hop.at), ya = rowY(hop.from), yb = rowY(hop.from + 1);
                    if (hop.ok) {
                        ctx.strokeStyle = C.accent;
                        ctx.lineWidth = 1.5;
                        line(ctx, xa, ya, xa, yb - 3);
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(xa - 3, yb - 6); ctx.lineTo(xa, yb - 1); ctx.lineTo(xa + 3, yb - 6);
                        ctx.stroke();
                        if (wide) text(ctx, `ch ${hop.ch}`, xa + 5, (ya + yb) / 2 + 4, C.dim);
                        row = hop.from + 1;
                    } else {
                        lost(ctx, xa, ya, (ya + yb) / 2);
                        if (wide) text(ctx, `ch ${hop.ch}`, xa + 6, (ya + yb) / 2 + 4, C.dim);
                    }
                    since = hop.at;
                }
                if (t >= ready && t < done) { ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.strokeStyle = C.accent; line(ctx, X(since), rowY(row), X(t), rowY(row)); ctx.lineWidth = 1; ctx.globalAlpha = 1; }
                if (t >= ready) { ctx.fillStyle = C.accent; dot(ctx, X(Math.min(t, done)), rowY(t >= done ? ROWS.length - 1 : row), 3.5); ctx.fill(); }

                const sy = Math.round(h * 0.6);
                ctx.font = `500 ${TYPE}`;
                const retries = hops.filter((hp) => !hp.ok).length;
                const on = `Listening ${pct(WINDOW / T)} of the time`;
                const took = `${secs(done - ready)}${retries ? `, ${retries} retr${retries > 1 ? "ies" : "y"}` : ""}`;
                const trail = t >= done ? `this reading took ${took}` : t >= ready ? "reading on its way" : "waiting for a reading";
                const brief = `Listening ${pct(WINDOW / T)} · ${t >= done ? took : "on its way"}`;
                text(ctx, fit(ctx, [`Wake every ${secs(T)} · ${on.toLowerCase()} · ${trail}`, `${on} · ${trail}`, brief], w - 2 * pad), pad, sy, C.ink, "left", "500");

                // The trade-off: radio-on time drains the battery, sleeping longer delays readings.
                const cy = Math.round(h * 0.665), cx = [pad, pad + (w > 480 ? 84 : 56)], gw = (x1 - cx[1] - 16) / 2;
                ctx.font = TYPE;
                text(ctx, fit(ctx, ["Wake every", "Every"], cx[1] - cx[0] - 6), cx[0], cy, C.dim);
                text(ctx, fit(ctx, ["Time spent listening (drains the battery)", "Listening (battery)", "Listening"], gw), cx[1], cy, C.dim);
                text(ctx, fit(ctx, ["Average delay, if nothing is lost", "Average delay", "Delay"], gw), cx[1] + gw + 16, cy, C.dim);
                ctx.strokeStyle = C.line;
                line(ctx, pad, cy + 8.5, x1, cy + 8.5);
                OPTIONS.forEach((T2, k) => {
                    const y = Math.round(h * (0.73 + k * 0.08)), sel = k === pick;
                    const values = [[WINDOW / T2, WINDOW / OPTIONS[0], pct(WINDOW / T2)], [(SLEEPERS * T2) / 2, (SLEEPERS * OPTIONS[OPTIONS.length - 1]) / 2, secs((SLEEPERS * T2) / 2)]];
                    text(ctx, `${sel ? "▸ " : ""}${secs(T2)}`, cx[0], y + 4, sel ? C.ink : C.dim, "left", sel ? "500" : "");
                    values.forEach(([v, max, label], j) => {
                        const bx = cx[1] + j * (gw + 16), bw = gw - 44;
                        ctx.fillStyle = C.leader;
                        ctx.fillRect(bx, y - 3, bw, 6);
                        ctx.fillStyle = sel ? C.ink : C.mid;
                        ctx.fillRect(bx, y - 3, Math.max(1.5, (bw * v) / max), 6);
                        text(ctx, label, bx + gw, y + 4, sel ? C.ink : C.dim, "right", sel ? "500" : "");
                    });
                });
            },
        };
    }

    mount(document.getElementById("mesh"), mesh(document.getElementById("mesh-caption")));
    mount(document.getElementById("storage"), storageMeter());
    mount(document.getElementById("battery"), battery());
    mount(document.getElementById("linkq"), linkQuality());
    mount(document.getElementById("speeds"), fasterSpeeds());
    mount(document.getElementById("diffusion"), diffusion());

    // Arrow buttons for the sideways row of work pieces.
    const row = document.querySelector(".pieces");
    const arrows = [...document.querySelectorAll(".scroller-nav button")];
    if (row) {
        // Pieces can differ in width, so each arrow scrolls to the start of the next or previous piece.
        const starts = () => [...row.children].map((c) => c.offsetLeft - row.firstElementChild.offsetLeft);
        arrows.forEach((b) => b.addEventListener("click", () => {
            const x = row.scrollLeft;
            const left = Number(b.dataset.dir) > 0 ? starts().find((s) => s > x + 2) : starts().reverse().find((s) => s < x - 2);
            if (left !== undefined) row.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
        }));
        const sync = () => {
            arrows[0].disabled = row.scrollLeft <= 2;
            arrows[1].disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
        };
        row.addEventListener("scroll", sync, { passive: true });
        addEventListener("resize", sync);
        sync();
    }

    // Highlight the nav link for the section currently in view. Only in-page links take part;
    // a link to another page (like Work) keeps whatever aria-current the page gives it.
    const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
    if (!navLinks.length) return;
    const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href")));
    const spy = () => {
        const y = innerHeight * 0.35;
        let i = 0;
        sections.forEach((s, k) => { if (s && s.getBoundingClientRect().top <= y) i = k; });
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) i = sections.length - 1;
        navLinks.forEach((a, k) => a.toggleAttribute("aria-current", k === i));
    };
    addEventListener("scroll", spy, { passive: true });
    addEventListener("resize", spy);
    spy();
})();

// SVG grafikler (mockup'taki alan grafiği ve halka grafik).

type Nokta = [number, number];

function yumusakYol(pts: Nokta[], taban: number) {
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(taban, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(taban, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Açılan (dolgulu alan) ve tamamlanan (kesikli çizgi) günlük sayılar. */
export function AlanGrafigi({ acilan, kapanan, etiketler }: { acilan: number[]; kapanan: number[]; etiketler: string[] }) {
  const W = 880, H = 330, L = 46, R = 52, T = 18, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const mx = Math.max(...acilan, ...kapanan, 1);
  const adim = mx > 40 ? 20 : mx > 20 ? 10 : mx > 8 ? 5 : mx > 4 ? 2 : 1;
  const ust = Math.ceil(mx / adim) * adim || adim;
  const x = (i: number) => L + i * (iw / Math.max(etiketler.length - 1, 1));
  const y = (v: number) => T + ih - (v / ust) * ih;
  const taban = T + ih;
  const po: Nokta[] = acilan.map((v, i) => [x(i), y(v)]);
  const pc: Nokta[] = kapanan.map((v, i) => [x(i), y(v)]);
  const tikler: number[] = [];
  for (let v = 0; v <= ust; v += adim) tikler.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Son 7 günde açılan ve tamamlanan Task sayıları">
      {tikler.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#1F2D4A" strokeWidth="1" />
          <text x={L - 10} y={y(v) + 4} textAnchor="end" fill="#94A2BB" fontSize="13">
            {v}
          </text>
        </g>
      ))}
      {etiketler.map((l, i) => (
        <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fill="#94A2BB" fontSize="14">
          {l}
        </text>
      ))}
      <path d={`${yumusakYol(po, taban)} L${x(etiketler.length - 1)},${taban} L${L},${taban} Z`} fill="rgba(29,79,215,.28)" />
      <path d={yumusakYol(po, taban)} fill="none" stroke="#2F5FE0" strokeWidth="2.5" />
      <path d={yumusakYol(pc, taban)} fill="none" stroke="#34D399" strokeWidth="2" strokeDasharray="6 5" />
      {pc.map((p, i) => (
        <circle key={`c${i}`} cx={p[0]} cy={p[1]} r="3.5" fill="#34D399" />
      ))}
      {po.map((p, i) => (
        <circle key={`o${i}`} cx={p[0]} cy={p[1]} r="5" fill="#F5C518" stroke="#121D33" strokeWidth="2">
          <title>
            {etiketler[i]}: {acilan[i]} açılan, {kapanan[i]} tamamlanan
          </title>
        </circle>
      ))}
    </svg>
  );
}

export function HalkaGrafik({ parcalar, etiket }: { parcalar: Array<{ l: string; renk: string; v: number }>; etiket: string }) {
  const toplam = parcalar.reduce((a, p) => a + p.v, 0);
  const r = 78, c = 2 * Math.PI * r;
  let ofs = 0;
  return (
    <svg viewBox="0 0 220 220" role="img" aria-label={`${etiket}: ${parcalar.map((p) => `${p.l} ${p.v}`).join(', ')}`}>
      <circle cx="110" cy="110" r={r} fill="none" stroke="#19263F" strokeWidth="30" />
      {parcalar
        .filter((p) => p.v)
        .map((p) => {
          const len = (p.v / (toplam || 1)) * c;
          const el = (
            <circle
              key={p.l}
              cx="110"
              cy="110"
              r={r}
              fill="none"
              stroke={p.renk}
              strokeWidth="30"
              strokeDasharray={`${len.toFixed(2)} ${(c - len).toFixed(2)}`}
              strokeDashoffset={(-ofs).toFixed(2)}
              transform="rotate(-90 110 110)"
            >
              <title>
                {p.l}: {p.v}
              </title>
            </circle>
          );
          ofs += len;
          return el;
        })}
      <text x="110" y="108" textAnchor="middle" fill="#F2F5FA" fontSize="34" fontWeight="800">
        {toplam}
      </text>
      <text x="110" y="132" textAnchor="middle" fill="#94A2BB" fontSize="13">
        {etiket}
      </text>
    </svg>
  );
}

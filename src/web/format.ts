const ROL_ADI: Record<string, string> = { DIREKTOR: 'Direktör', UNIT_HEAD: 'Unit Head', TEAM_HEAD: 'Team Head', CALISAN: 'Çalışan' };
export const rolAdi = (r: string) => ROL_ADI[r] ?? r;

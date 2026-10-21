// Только публичные настройки. Банк правильных ответов остаётся на сервере.
export const SEAT_LIMIT = 4;
export const MAX_TEAMS = 50;
export const ECONOMY_PENALTY = 20;
export const CRISIS_THRESHOLD = 30;
export const RESOURCE_CAP = 1000;
export const DEVELOPMENT_STAGES = [
  { at: 0, name: "Территория", description: "Первые дома появятся на 100 ресурсах", buildings: 0 },
  { at: 100, name: "Поселение", description: "Жилые дома и первые улицы", buildings: 4 },
  { at: 250, name: "Ауыл", description: "Новые кварталы и культурный памятник", buildings: 12 },
  { at: 500, name: "Малый город", description: "Площадь, общественные здания и парк", buildings: 24 },
  { at: 750, name: "Большой город", description: "Многоэтажные кварталы и новые дороги", buildings: 42 },
  { at: RESOURCE_CAP, name: "Город построен", description: "Максимальное развитие достигнуто", buildings: 64 }
];
export function developmentFor(points) {
  const resource = Math.max(0, Math.min(RESOURCE_CAP, Number(points) || 0));
  const index = DEVELOPMENT_STAGES.findLastIndex(stage => resource >= stage.at);
  return { ...DEVELOPMENT_STAGES[index], index, next: DEVELOPMENT_STAGES[index + 1] || null, complete: resource >= RESOURCE_CAP, progress: resource / RESOURCE_CAP };
}
export const REGIONS = [
  { id: "saryarka", name: "Сарыарқа", color: "#D9A441", glow: "#F6D27A" },
  { id: "jetisu", name: "Жетісу", color: "#2FA5A9", glow: "#7FE3E6" },
  { id: "mangystau", name: "Маңғыстау", color: "#C1543A", glow: "#F08A6E" },
  { id: "turkistan", name: "Түркістан", color: "#6B5B95", glow: "#B3A4E0" }
];

export function metadataFor(team) {
  const base = REGIONS.find(r => r.id === (team.baseRegionId || team.id)) || REGIONS[0];
  return { ...base, id: team.id, baseRegionId: base.id, name: team.name || base.name };
}
export function mapRegionsFor(teams, focusedTeamId = null) {
  const focused = teams.find(t => t.id === focusedTeamId);
  return REGIONS.map(base => {
    const peers = teams.filter(t => metadataFor(t).baseRegionId === base.id);
    const selected = focused && metadataFor(focused).baseRegionId === base.id ? [focused] : peers;
    const occupied = selected.filter(t => t.members.length);
    const source = occupied.length ? occupied : selected;
    return { id: base.id, points: source.length ? Math.round(source.reduce((sum, t) => sum + t.points, 0) / source.length) : 0, economy: source.length ? Math.round(source.reduce((sum, t) => sum + t.economy, 0) / source.length) : 100 };
  });
}

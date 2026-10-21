// Только публичные настройки. Банк правильных ответов остаётся на сервере.
export const SEAT_LIMIT = 4;
export const MAX_TEAMS = 50;
export const MAX_TEAM_CAPACITY = 50;
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
  { id: "karaganda", name: "Қарағанды облысы", geoId: "KZ35", biome: "steppe", color: "#D9A441", glow: "#F6D27A" },
  { id: "jetisu", name: "Жетісу облысы", geoId: "KZ33", biome: "mountain", color: "#2FA5A9", glow: "#7FE3E6" },
  { id: "mangystau", name: "Маңғыстау облысы", geoId: "KZ47", biome: "desert", color: "#C1543A", glow: "#F08A6E" },
  { id: "turkistan", name: "Түркістан облысы", geoId: "KZ61", biome: "south", color: "#6B5B95", glow: "#B3A4E0" },
  { id: "abai", name: "Абай облысы", geoId: "KZ10", biome: "steppe", color: "#C58F63", glow: "#F2C195" },
  { id: "akmola", name: "Ақмола облысы", geoId: "KZ11", biome: "forest", color: "#91AC66", glow: "#C9EBA2" },
  { id: "aktobe", name: "Ақтөбе облысы", geoId: "KZ15", biome: "steppe", color: "#CF8267", glow: "#F1B196" },
  { id: "almaty-region", name: "Алматы облысы", geoId: "KZ19", biome: "mountain", color: "#579AB5", glow: "#94D4ED" },
  { id: "atyrau", name: "Атырау облысы", geoId: "KZ23", biome: "desert", color: "#D6B574", glow: "#F6DAA5" },
  { id: "west-kazakhstan", name: "Батыс Қазақстан облысы", geoId: "KZ27", biome: "forest", color: "#75A88A", glow: "#A6D8B9" },
  { id: "zhambyl", name: "Жамбыл облысы", geoId: "KZ31", biome: "south", color: "#B8AA50", glow: "#E5D982" },
  { id: "kostanay", name: "Қостанай облысы", geoId: "KZ39", biome: "forest", color: "#9BAD78", glow: "#D1E1A7" },
  { id: "kyzylorda", name: "Қызылорда облысы", geoId: "KZ43", biome: "desert", color: "#BA805B", glow: "#E9B891" },
  { id: "pavlodar", name: "Павлодар облысы", geoId: "KZ55", biome: "forest", color: "#6BA8A0", glow: "#9BDCD2" },
  { id: "north-kazakhstan", name: "Солтүстік Қазақстан облысы", geoId: "KZ59", biome: "forest", color: "#7AA878", glow: "#AFDCAA" },
  { id: "ulytau", name: "Ұлытау облысы", geoId: "KZ62", biome: "steppe", color: "#B8976A", glow: "#E6CCA1" },
  { id: "east-kazakhstan", name: "Шығыс Қазақстан облысы", geoId: "KZ63", biome: "mountain", color: "#7499B6", glow: "#ACD4F3" },
  { id: "astana", name: "Астана", geoId: "KZ71", biome: "city", color: "#D6BB6F", glow: "#FFE4A0" },
  { id: "almaty", name: "Алматы", geoId: "KZ75", biome: "city", color: "#63BAAA", glow: "#9CEAD9" },
  { id: "shymkent", name: "Шымкент", geoId: "KZ79", biome: "city", color: "#BF8EAF", glow: "#ECC0DD" }
];

export const capacityFor = team => team.capacity ?? SEAT_LIMIT;
export const totalCapacity = teams => teams.reduce((sum, team) => sum + capacityFor(team), 0);
export const normalizeRegionId = id => id === "saryarka" ? "karaganda" : id;
export function metadataFor(team) {
  const base = REGIONS.find(r => r.id === normalizeRegionId(team.baseRegionId || team.id)) || REGIONS[0];
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

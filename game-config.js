// Только публичные настройки. Банк правильных ответов остаётся на сервере.
export const SEAT_LIMIT = 4;
export const PRIVACY_VERSION = '2026-10-23';
export const DEFAULT_SUBJECT = 'Мәдениеттану';
export const DEFAULT_BRANDING = {university:'Учебный проект',title:'Мәдениеттану 3D',subject:DEFAULT_SUBJECT,subjects:[DEFAULT_SUBJECT],accent:'#3FE0D0',gold:'#F3C25D',logo:'',operator:'',privacyContact:''};
export const MAX_TEAMS = 50;
export const MAX_TEAM_CAPACITY = 50;
export const MAX_PLAYERS = 500;
export const CREATOR_TEAM_ID = "creators";
export const CREATOR_NAMES = { ernur: "Ернур", adilet: "Адилет" };
export const MODE_NAMES = {team:'Аймақтық одақ',solo:'Жеке сайыс'};
export const ECONOMY_FLOOR = 15;
export const soloMultiplier = streak => 1 + Math.min(8, Math.max(0, streak || 0)) * .25;
export const isCreatorTeam = team => team?.id === CREATOR_TEAM_ID;
export const regularTeams = teams => teams.filter(team => !isCreatorTeam(team));
export const ECONOMY_PENALTY = 20;
export const ACHIEVEMENTS = [{id:'sky-breaker',title:'Ты смог, братец',description:'Обязательно: упасть до 15% экономики и восстановить её ответами до 100%. Затем либо первым достичь 1000 ресурсов при 100% экономики, либо занять первое место в рейтинге после последнего вопроса. При равенстве условий награду получают все лидеры.',icon:'⟐'}];
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

// One original drill mesh is shared by the local replay and the existing 3D map.
export function createDrillGeometryData(){
  const vertices=[],faces=[];let component=0;
  const vertex=(radius,y,angle)=>{vertices.push([Math.cos(angle)*radius,y,Math.sin(angle)*radius]);return vertices.length-1};
  const triangle=(a,b,c,metal)=>{
    const p=vertices[a],q=vertices[b],r=vertices[c],u=q.map((v,i)=>v-p[i]),v=r.map((x,i)=>x-p[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
    faces.push({indices:[a,b,c],normal:normal.map(n=>n/length),metal,component});
  };
  const quad=(a,b,c,d,metal)=>{triangle(a,b,c,metal);triangle(a,c,d,metal)};
  const ring=(radius,y)=>Array.from({length:32},(_,i)=>vertex(radius,y,i*Math.PI/16));
  let previous=ring(.008,0);
  for(let row=1;row<=8;row++){
    const next=ring(1.07*row/8,3.6*row/8);
    for(let i=0;i<32;i++)quad(previous[i],next[i],next[(i+1)%32],previous[(i+1)%32],0);
    previous=next;
  }
  // A continuous triangular flight winds around the cone; its edges and undersides catch different light.
  let last=null;component=1;
  for(let step=0;step<=180;step++){
    const t=.035+.965*step/180,y=3.6*t,r=1.07*t,angle=t*Math.PI*9.2;
    const next=[vertex(Math.max(.008,r-.083*t),y-.21*t,angle),vertex(r+.025+.28*t,y,angle),vertex(r+.025*t,y+.16*t,angle)];
    if(last){quad(last[0],next[0],next[1],last[1],1);quad(last[1],next[1],next[2],last[2],2)}
    last=next;
  }
  previous=ring(1.07,3.6);component=2;
  for(const [radius,y,metal]of [[1.19,3.68,2],[1.19,3.8,0],[1.16,3.83,3],[1.16,3.89,3],[1.08,3.94,0],[1.08,4.12,0],[.94,4.21,2]]){
    const next=ring(radius,y);for(let i=0;i<32;i++)quad(previous[i],next[i],next[(i+1)%32],previous[(i+1)%32],metal);previous=next;
  }
  return {vertices,faces};
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

export const CITIES = [
  ['mangystau','zhanaozen','Жаңаөзен'],['karaganda','temirtau','Теміртау'],['jetisu','tekeli','Текелі'],
  ['turkistan','arys','Арыс'],['abai','ayagoz','Аягөз'],['akmola','stepnogorsk','Степногорск'],
  ['aktobe','khromtau','Хромтау'],['almaty-region','talgar','Талғар'],['atyrau','kulsary','Құлсары'],
  ['west-kazakhstan','aksay','Ақсай'],['zhambyl','shu','Шу'],['kostanay','rudny','Рудный'],
  ['kyzylorda','aral','Арал'],['pavlodar','ekibastuz','Екібастұз'],['north-kazakhstan','taiynsha','Тайынша'],
  ['ulytau','satpayev','Сәтбаев'],['east-kazakhstan','ridder','Риддер'],
  ['mangystau','aktau','Ақтау'],['karaganda','karaganda-city','Қарағанды'],['jetisu','taldykorgan','Талдықорған'],
  ['turkistan','turkistan-city','Түркістан'],['abai','semey','Семей'],['akmola','kokshetau','Көкшетау'],
  ['aktobe','aktobe-city','Ақтөбе'],['almaty-region','konaev','Қонаев'],['atyrau','atyrau-city','Атырау'],
  ['west-kazakhstan','oral','Орал'],['zhambyl','taraz','Тараз'],['kostanay','kostanay-city','Қостанай'],
  ['kyzylorda','kyzylorda-city','Қызылорда'],['pavlodar','pavlodar-city','Павлодар'],
  ['north-kazakhstan','petropavl','Петропавл'],['ulytau','zhezkazgan','Жезқазған'],['east-kazakhstan','oskemen','Өскемен']
].map(([baseRegionId,id,name])=>({baseRegionId,id,name}));
export const capacityFor = team => team.capacity ?? SEAT_LIMIT;
export const totalCapacity = teams => teams.reduce((sum, team) => sum + capacityFor(team), 0);
export const normalizeRegionId = id => id === "saryarka" ? "karaganda" : id;
export function metadataFor(team) {
  const base = REGIONS.find(r => r.id === normalizeRegionId(team.baseRegionId || team.id)) || REGIONS[0];
  return { ...base, id: team.id, baseRegionId: base.id, name: team.name || base.name,cityId:team.cityId||null };
}
export function mapRegionsFor(teams, focusedTeamId = null) {
  const focused = teams.find(t => t.id === focusedTeamId);
  return REGIONS.map(base => {
    const peers = teams.filter(t => metadataFor(t).baseRegionId === base.id);
    const selected = focused && metadataFor(focused).baseRegionId === base.id ? [focused] : peers;
    const occupied = selected.filter(t => (t.occupied??t.members.length)>0||t.members.length>0);
    const source = occupied.length ? occupied : selected;
    return { id: base.id, points: source.length ? Math.round(source.reduce((sum, t) => sum + t.points, 0) / source.length) : 0, economy: source.length ? Math.round(source.reduce((sum, t) => sum + t.economy, 0) / source.length) : 100 };
  });
}

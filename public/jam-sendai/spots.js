/*
  シェアサロンJAM 仙台店 — 文章と店舗情報

  サイトの文章はこのファイルだけで直せます（3Dの配置は jam.js の LAYOUT）。
  〔記入待ち〕 は実際の情報に差し替えてください。事実（料金・設備・営業時間など）は
  こちらでは作っていません。
*/

export const STORE = {
  name: 'シェアサロン JAM 仙台店',
  nameEn: 'SHARE SALON JAM — SENDAI',
  address: '〔記入待ち〕 宮城県仙台市…',
  access: '〔記入待ち〕 最寄り駅から徒歩◯分',
  hours: '〔記入待ち〕',
  holiday: '〔記入待ち〕',
  tel: '〔記入待ち〕',
  // TODO: 予約・問い合わせ先のURL（空のままならボタンは「準備中」になります）
  reserveUrl: '',
  instagramUrl: '',
  mapUrl: '',
};

/*
  id は jam.js の LAYOUT と対応しています。並び順＝フロアガイドの順番。
  specs は [見出し, 内容] の組。増やしても減らしてもかまいません。
*/
const BOOTH_BODY =
  '壁で仕切られたプライベートブース。鏡の前に座ったお客さまの視界には、あなたと鏡だけ。' +
  '周りの気配を気にせず、施術とカウンセリングに集中できます。';

const BOOTH_SPECS = [
  ['設備', '〔記入待ち〕 セット椅子／ミラー／ワゴン など'],
  ['広さ', '〔記入待ち〕'],
  ['利用料金', '〔記入待ち〕'],
];

export const SPOTS = [
  {
    id: 'reception',
    en: 'Reception',
    ja: 'レセプション',
    catch: '扉を開けた瞬間から、特別な一日が始まる。',
    body:
      'お客さまを最初にお迎えする場所。チェックインからお見送りまで、' +
      'ホテルのような落ち着いた対応でサロンの印象を整えます。',
    specs: [
      ['受付時間', '〔記入待ち〕'],
      ['お支払い', '〔記入待ち〕'],
    ],
  },
  { id: 'booth01', en: 'Booth 01', ja: 'プライベートブース 01', catch: '光を味方にする、窓際の一席。', body: BOOTH_BODY, specs: BOOTH_SPECS },
  { id: 'booth02', en: 'Booth 02', ja: 'プライベートブース 02', catch: '仕上がりを、いちばん正直に映す鏡。', body: BOOTH_BODY, specs: BOOTH_SPECS },
  { id: 'booth03', en: 'Booth 03', ja: 'プライベートブース 03', catch: '奥まった静けさを、指名の理由に。', body: BOOTH_BODY, specs: BOOTH_SPECS },
  { id: 'booth04', en: 'Booth 04', ja: 'プライベートブース 04', catch: 'あなたの名前で迎える、自分だけのサロン。', body: BOOTH_BODY, specs: BOOTH_SPECS },
  { id: 'booth05', en: 'Booth 05', ja: 'プライベートブース 05', catch: '会話も、沈黙も、心地よい距離で。', body: BOOTH_BODY, specs: BOOTH_SPECS },
  { id: 'booth06', en: 'Booth 06', ja: 'プライベートブース 06', catch: 'いちばん奥の、とっておきの一席。', body: BOOTH_BODY, specs: BOOTH_SPECS },
  {
    id: 'lounge',
    en: 'Lounge',
    ja: 'ラウンジ',
    catch: '待つ時間まで、記憶に残る体験に。',
    body:
      'フロア中央のラウンジ。カラーの放置時間や、施術前のひとときを' +
      'ゆったり過ごしていただくための空間です。',
    specs: [
      ['席数', '〔記入待ち〕'],
      ['ドリンク', '〔記入待ち〕'],
    ],
  },
  {
    id: 'shampoo',
    en: 'Shampoo',
    ja: 'シャンプーエリア',
    catch: '目を閉じた先まで、上質であること。',
    body:
      'フロアの最奥、照明を落としたシャンプーエリア。' +
      'ブースから少し歩くだけの、ご褒美のような時間をつくります。',
    specs: [
      ['台数', '〔記入待ち〕'],
      ['設備', '〔記入待ち〕'],
    ],
  },
];

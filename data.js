export const PAIRS = [
  {id:'neon',genre:'demo',tag:'音源なしですぐに',name:'夜を走る、ネオンEDM',description:'軽やかなシンセから、きらめくドロップへ。まずはこの2曲で。',theme:'neon',bpm:126,tracks:[{title:'Neon Drive',artist:'TAPMIX Original'},{title:'Afterglow',artist:'TAPMIX Original'}]},
  {id:'moon',genre:'demo',tag:'音源なしですぐに',name:'ゆったり、深夜のダンス',description:'少しテンポを落として。浮遊感のある2曲を、なめらかにつなぐ。',theme:'moon',bpm:112,tracks:[{title:'Moonlight',artist:'TAPMIX Original'},{title:'Blue Hour',artist:'TAPMIX Original'}]},
  {id:'deco',genre:'vocaloid',tag:'ボカロの定番',name:'初音ミク × ロック',description:'ギターの勢いと、耳に残るサビ。同じ作り手の世界を楽しむ組み合わせ。',theme:'deco',tracks:[{title:'ヒバナ',artist:'DECO*27 feat. 初音ミク',youtube:'hxSg2Ioz3LM'},{title:'ゴーストルール',artist:'DECO*27 feat. 初音ミク',youtube:'KushW6zvazM'}]},
  {id:'wowaka',genre:'vocaloid',tag:'駆け抜けるボカロ',name:'wowakaの熱量をつなぐ',description:'畳みかける歌声とロックの疾走感。まずは原曲の流れを聴いてみよう。',theme:'wowaka',tracks:[{title:'ローリンガール',artist:'wowaka feat. 初音ミク',youtube:'vnw8zURAxkU'},{title:'アンノウン・マザーグース',artist:'wowaka feat. 初音ミク',youtube:'P_CSdxSGfaA'}]},
  {id:'livetune',genre:'vocaloid',tag:'きらめく電子音',name:'ミクと、明るいフロアへ',description:'kzの明るいシンセと初音ミク。歌えるエレクトロポップを2曲。',theme:'livetune',tracks:[{title:'Tell Your World',artist:'livetune feat. 初音ミク',youtube:'PqJNc9KVIZE'},{title:'Hand in Hand',artist:'livetune feat. 初音ミク',youtube:'RKtoreimcQ8'}]},
  {id:'avicii',genre:'edm',tag:'歌えるフェスEDM',name:'Aviciiと、あの高揚感',description:'アコースティックな温かさから、ダンスの高揚感へ。親しみやすい2曲。',theme:'avicii',tracks:[{title:'Wake Me Up',artist:'Avicii',youtube:'IcrbM1l_BoI'},{title:'The Nights',artist:'Avicii',youtube:'UtF6Jej8yb4'}]},
  {id:'zedd',genre:'edm',tag:'メロディックEDM',name:'歌声でつなぐ、Zedd',description:'力強い女性ボーカルと大きな展開。メロディを楽しみたいときに。',theme:'zedd',tracks:[{title:'Clarity',artist:'Zedd feat. Foxes',youtube:'IxxstCcJlsc'},{title:'Stay The Night',artist:'Zedd feat. Hayley Williams',youtube:'i-gyZ35074k'}]},
  {id:'custom',genre:'custom',tag:'あなたのライブラリ',name:'好きな2曲でつくろう',description:'利用できる音源を2つ選ぶだけ。つなぐタイミングは、おまかせ。',theme:'custom',tracks:[{title:'あなたの曲 A',artist:'音源を追加してください'},{title:'あなたの曲 B',artist:'音源を追加してください'}]},
];
export const youtubeURL = id => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

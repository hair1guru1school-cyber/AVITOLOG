(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KpImageMatch=api;
}(typeof window==='undefined'?this:window,function(){
  'use strict';
  var GROUPS=[
    ['fences','Заборы и ворота','🧱',/^(забор|огражден|штакет|ворот|секцион)/],
    ['houses','Дома и каркасы','🏠',/^(дом(?:а|ов|ы|у|е|ом|ик.*)?$|каркас|коттедж)/],
    ['construction','Строительство и ремонт','🏗️',/^(строит|ремонт)/],
    ['roof','Кровля','🏡',/^(кровл|крыш)/],
    ['kitchens','Кухни','🍽️',/^кухн/],
    ['furniture','Мебель','🛋️',/^(мебел|шкаф|стол(?!б)|кроват|диван)/],
    ['piles','Сваи','🔩',/^(сва[ийяе]|винтов)/],
    ['foundation','Фундаменты','🏠',/^фундамент/],
    ['waterproof','Гидроизоляция','💧',/^гидроизол/],
    ['wood','Пиломатериалы','🪵',/^(пиломат|доск|брус|древес)/],
    ['cabins','Бытовки','🏢',/^(бытов|хозблок|блокконтейн)/],
    ['pavilions','Павильоны','🏪',/^(павильон|киоск)/],
    ['terraces','Террасы','🌿',/^(террас|веранд)/],
    ['electrical','Электрика','⚡',/^электр/],
    ['windows','Окна','🪟',/^(окн|окон|остекл)/],
    ['monuments','Памятники','🪦',/^(памятник|надгроб|мемориал)/],
    ['bulk','Сыпучие материалы','⛰️',/^(сыпуч|щебен|песок|песк|гравий)/],
    ['china','Товары из Китая','📦',/^кита/],
    ['vehicles','Авто и спецтехника','🚗',/^(авто|мот[о]|спецтех|экскават|трактор)/],
    ['cleaning','Уборка и дезинфекция','🧹',/^(клининг|уборк|дезинфек)/]
  ];
  var STOP=new Set(('проект клиент услуги услуга товары товар работы работа монтаж установка продажа производство компания под ключ для из по на в и с ооо ип москва московская область мо питер санкт петербург нижний новгород крым омск иркутск бизнес').split(' '));
  function words(text){return String(text||'').toLowerCase().replace(/ё/g,'е').replace(/\.[a-z0-9]{2,5}$/i,'').match(/[a-zа-я0-9]+/g)||[];}
  function stems(text){return words(text).filter(function(word){return word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word);}).map(function(word){return word.length>4?word.replace(/(?:иями|ами|ями|ого|ому|ыми|ими|ые|ий|ый|ая|ое|ые|ов|ев|ам|ям|ах|ях|ы|а|я|и|у|е)$/,''):word;});}
  function tags(text){var list=words(text);return GROUPS.filter(function(group){return list.some(function(word){return group[3].test(word);});}).map(function(group){return group[0];});}
  function entryTags(entry){return tags(String(entry.name||'')+' '+String(entry.groupName||''));}
  function match(context,entries){
    var best=null,bestScore=0;
    (entries||[]).forEach(function(entry){
      var text=String(entry.name||'')+' '+String(entry.groupName||''),terms=stems(text),labels=entryTags(entry),score=0;
      [['category',10000],['title',1000],['description',100]].forEach(function(field){
        var value=String(context&&context[field[0]]||''),wanted=tags(value),common=stems(value).filter(function(word){return terms.indexOf(word)>=0;}),strong=common.filter(function(word){return !/^(строит|ремонт)/.test(word);}).length;
        var specific=wanted.filter(function(id){return id!=='construction'&&labels.indexOf(id)>=0;}).length;
        if(strong||specific)score+=field[1]+Math.min(20,strong*3+specific*2);
        else if(wanted.indexOf('houses')>=0&&labels.indexOf('construction')>=0)score+=field[1]*.05;
        else if(wanted.indexOf('construction')>=0&&labels.indexOf('construction')>=0)score+=field[1]*.01;
        if((strong||specific)&&words(value).join(' ')===words(entry.name).join(' '))score+=field[1]*.1;
      });
      if(score>bestScore){best=entry;bestScore=score;}
    });
    return bestScore>0?best:null;
  }
  function niches(entries){
    var out=GROUPS.map(function(group){return {id:group[0],name:group[1],emoji:group[2],count:(entries||[]).filter(function(entry){return entryTags(entry).indexOf(group[0])>=0;}).length};}).filter(function(group){return group.count>0;});
    var other=(entries||[]).filter(function(entry){return !entryTags(entry).length;}).length;
    if(other)out.push({id:'other',name:'Другие',emoji:'🖼️',count:other});return out;
  }
  function belongs(entry,id){var list=entryTags(entry);return id==='all'||id==='other'&&!list.length||list.indexOf(id)>=0;}
  function emoji(name,id){if(id==='all')return '🖼️';if(id==='goods')return '📦';if(id==='services')return '🛠️';var list=tags(name),group=GROUPS.find(function(item){return item[0]===list[0];});return group?group[2]:'📁';}
  return {match:match,niches:niches,belongs:belongs,emoji:emoji};
}));

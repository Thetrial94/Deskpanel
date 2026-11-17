export function homeRooms(devices){
 const groups=new Map();
 for(const d of devices){
  const id=JSON.stringify([d.household?.id||'',d.room?.id||'']);
  if(!groups.has(id))groups.set(id,{id,name:d.room?.name||'Без комнаты',house:d.household?.name||'Дом',devices:[]});
  groups.get(id).devices.push(d);
 }
 return [...groups.values()].sort((a,b)=>Number(a.name==='Без комнаты')-Number(b.name==='Без комнаты')||a.house.localeCompare(b.house,'ru')||a.name.localeCompare(b.name,'ru'));
}
export function deviceType(device){
 const type=device.kind||'';
 if(type.includes('light'))return 'Свет';
 if(type.includes('socket'))return 'Розетка';
 if(type.includes('sensor')||type.includes('button'))return type.includes('button')?'Кнопка':'Датчик';
 if(type.includes('speaker'))return 'Колонка';
 if(type.includes('thermostat'))return 'Климат';
 if(type.includes('switch'))return 'Выключатель';
 return 'Устройство';
}
export function deviceState(device){
 if(device.value)return device.value;
 if(device.on!==null&&device.on!==undefined)return device.on?'Включено':'Выключено';
 return device.controllable?'Состояние не передано':'Нет доступного показания';
}

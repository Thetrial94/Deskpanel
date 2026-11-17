import { icon } from '../ui/icons.js';
const states={
 loading:['Подключаем пульт…','Проверяем плеер на компьютере.'],
 starting:['Плеер запускается','Ожидаем готовности приложения на компьютере.'],
 connected:['Пульт подключён','Управляй музыкой на компьютере с этого экрана.'],
 stopped:['Плеер закрыт','Запусти приложение и выбери музыку на компьютере.'],
 not_installed:['Плеер не найден','Установи Яндекс Музыку RS на компьютер с DeskPanel.'],
 different_installation:['Нужна настройка подключения','Открыта другая копия плеера. Проверь путь приложения на компьютере.'],
 unsupported:['Нужен компьютер с Windows','Управление Яндекс Музыкой RS доступно на Windows.'],
 unavailable:['Плеер не отвечает','Проверь приложение на компьютере. Подключение восстановится автоматически.'],
 disconnected:['Нет связи с компьютером','Проверь Wi-Fi и запущенную панель на компьютере.']
};
export default {
 id:'music',title:'Музыка',icon:'music',accent:'gold',
 mount(root,ctx){
  root.innerHTML='<section class="music-layout"><div class="music-art" aria-hidden="true"><div class="music-record"><div class="music-label">'+icon('music')+'</div></div><span class="music-art-caption">ТВОЙ РИТМ</span></div><div class="music-player"><span class="eyebrow">НА КОМПЬЮТЕРЕ · ЯНДЕКС МУЗЫКА RS</span><h1 data-music-title>Музыка под рукой.</h1><div class="music-connection"><i data-music-dot></i><span data-music-state></span></div><p class="music-description muted" data-music-description></p><div class="music-controls"><button class="music-skip" data-command="previous" aria-label="Предыдущий трек">'+icon('previous')+'</button><button class="music-toggle" data-command="toggle" aria-label="Воспроизведение / пауза"></button><button class="music-skip" data-command="next" aria-label="Следующий трек">'+icon('next')+'</button></div><div class="music-volume" data-volume-row hidden><label for="music-volume">'+icon('volume')+'<span>Громкость</span></label><input id="music-volume" type="range" min="0" max="100" step="1" aria-label="Громкость Яндекс Музыки" disabled><output for="music-volume" data-volume-output>—</output></div><button class="button button-primary music-launch" data-command="launch" hidden>Запустить на компьютере</button><p class="music-note muted" data-music-note>Точное состояние и громкость появятся после подключения расширенной версии плеера.</p><p class="music-feedback" data-music-feedback role="status" aria-live="polite"></p></div></section>';
  const slider=root.querySelector('#music-volume');
  let volumeEditing=false;
  const handler=e=>{const button=e.target.closest('[data-command]');if(button&&!button.disabled)ctx.music.command(button.dataset.command);};
  const input=()=>{volumeEditing=true;root.querySelector('[data-volume-output]').textContent=slider.value+'%';};
  const change=()=>{const value=Number(slider.value);volumeEditing=false;ctx.music.command('volume',value);};
  root.addEventListener('click',handler);slider.addEventListener('input',input);slider.addEventListener('change',change);
  let toggleKey='';
  const unsubscribe=ctx.music.subscribe((snapshot,pending,message)=>{
    const connection=snapshot.connection,connected=connection==='connected',enhanced=connected&&snapshot.enhanced;
    const playing=enhanced&&snapshot.playback==='playing';
    const [title,description]=states[connection]||states.unavailable;
    const state=enhanced?({playing:'Сейчас играет',paused:'На паузе',idle:'Выбери музыку',loading:'Загружаем трек…'})[snapshot.playback]||title:title;
    root.querySelector('[data-music-state]').textContent=state;
    const name=root.querySelector('[data-music-title]');
    name.textContent=enhanced&&snapshot.track?.title?snapshot.track.title:'Музыка под рукой.';
    name.title=name.textContent;
    root.querySelector('[data-music-description]').textContent=enhanced&&snapshot.track?.artist?snapshot.track.artist:description;
    root.querySelector('[data-music-dot]').classList.toggle('connected',connected);
    root.querySelector('.music-art').classList.toggle('is-playing',playing);
    for(const button of root.querySelectorAll('.music-controls button'))button.disabled=!connected||pending;
    const toggle=root.querySelector('[data-command="toggle"]');
    const label=!enhanced?'Пуск / пауза':snapshot.playback==='loading'?'Загрузка…':playing?'Пауза':'Играть';
    if(label!==toggleKey){toggleKey=label;toggle.innerHTML=icon(playing?'pause':'play')+'<span>'+label+'</span>';toggle.setAttribute('aria-label',label);}
    toggle.setAttribute('aria-pressed',String(playing));
    if(enhanced&&snapshot.playback==='loading')toggle.disabled=true;
    root.querySelector('[data-volume-row]').hidden=!enhanced;
    slider.disabled=!enhanced||pending;
    if(enhanced&&!pending&&!volumeEditing){slider.value=String(snapshot.volume);root.querySelector('[data-volume-output]').textContent=slider.value+'%';}
    const launch=root.querySelector('[data-command="launch"]');
    launch.hidden=connection!=='stopped'&&!connected;launch.disabled=pending;
    launch.textContent=connected?'Открыть приложение на компьютере':'Запустить на компьютере';
    launch.className=connected?'text-button music-launch':'button button-primary music-launch';
    root.querySelector('[data-music-note]').hidden=!connected||enhanced;
    root.querySelector('[data-music-feedback]').textContent=message;
  });
  return ()=>{unsubscribe();root.removeEventListener('click',handler);slider.removeEventListener('input',input);slider.removeEventListener('change',change);};
 }
};

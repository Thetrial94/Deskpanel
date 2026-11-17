import { icon } from '../ui/icons.js';
const states={
 starting:['Плеер запускается','Ожидаем готовности приложения на компьютере.'],
 loading:['Подключаем пульт…','Проверяем плеер на компьютере.'],
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
  root.innerHTML='<section class="music-layout"><div class="music-art" aria-hidden="true"><div class="music-record"><div class="music-label">'+icon('music')+'</div></div><span class="music-art-caption">ТВОЙ РИТМ</span></div><div class="music-player"><span class="eyebrow">НА КОМПЬЮТЕРЕ · ЯНДЕКС МУЗЫКА RS</span><h1>Музыка<br><span class="muted">под рукой.</span></h1><div class="music-connection"><i data-music-dot></i><span data-music-state></span></div><p class="music-description muted" data-music-description></p><div class="music-controls"><button class="music-skip" data-command="previous" aria-label="Предыдущий трек">'+icon('previous')+'</button><button class="music-toggle" data-command="toggle" aria-label="Воспроизведение / пауза">'+icon('play')+icon('pause')+'<span>Пуск / пауза</span></button><button class="music-skip" data-command="next" aria-label="Следующий трек">'+icon('next')+'</button></div><button class="button button-primary music-launch" data-command="launch" hidden>Запустить на компьютере</button><p class="music-note muted" data-music-note>Название трека и состояние воспроизведения доступны в приложении на компьютере.</p><p class="music-feedback" data-music-feedback role="status" aria-live="polite"></p></div></section>';
  const handler=e=>{const button=e.target.closest('[data-command]');if(button&&!button.disabled)ctx.music.command(button.dataset.command);};
  root.addEventListener('click',handler);
  const unsubscribe=ctx.music.subscribe((snapshot,pending,message)=>{
    const connection=snapshot.connection,connected=connection==='connected';
    const [title,description]=states[connection]||states.unavailable;
    root.querySelector('[data-music-state]').textContent=title;
    root.querySelector('[data-music-description]').textContent=description;
    root.querySelector('[data-music-dot]').classList.toggle('connected',connected);
    for(const button of root.querySelectorAll('.music-controls button'))button.disabled=!connected||pending;
    const launch=root.querySelector('[data-command="launch"]');
    launch.hidden=connection!=='stopped';launch.disabled=pending;
    root.querySelector('[data-music-note]').hidden=!connected;
    root.querySelector('[data-music-feedback]').textContent=message;
  });
  return ()=>{unsubscribe();root.removeEventListener('click',handler);};
 }
};
